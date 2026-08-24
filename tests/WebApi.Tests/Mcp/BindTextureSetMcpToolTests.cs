using System.Text.Json;
using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Agents;
using Application.Models;
using Application.TextureSets;
using Domain.Models;
using Moq;
using SharedKernel;
using WebApi.Infrastructure;
using WebApi.Mcp;
using Xunit;

namespace WebApi.Tests.Mcp;

/// <summary>
/// <c>bind_texture_set</c> is two writes wearing one idempotency key: it associates the set
/// with every version of the model and then makes it the model's default.
///
/// <para>
/// Each of those commits through the unit-of-work decorator, so the association used to
/// become durable and THEN the default could return a failure - a model that has versions
/// but no active one answers <c>NoActiveVersion</c>. <see cref="McpWriteGuard"/> reads a
/// RETURNED failure as "the tool declined before it mutated" and hands the key back as
/// retryable, which is the one thing it must not do here: the association was on disk,
/// no completed audit entry described it, and the retry ran it again.
/// </para>
///
/// <para>
/// The fix is a real transaction rather than a partial-applied report, so what these
/// verify is that both commands run inside ONE transaction and that a failure in the
/// second undoes the first. The claim still goes back on failure - and that is correct
/// only because nothing survived the rollback, which is what the durability assertions
/// are for.
/// </para>
/// </summary>
public class BindTextureSetMcpToolTests
{
    private static string Json(object value) => JsonSerializer.Serialize(value);

    private static McpCallerContext Caller() => McpCallerContext.Unauthenticated();

    /// <summary>An audit whose claim is granted and whose settles all report success.</summary>
    private static Mock<IAgentAudit> ClaimGranted()
    {
        var audit = new Mock<IAgentAudit>();
        audit.Setup(a => a.TryBeginAsync(It.IsAny<AgentWrite>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AgentClaim(AgentClaimOutcome.Owned, null, "gen-1"));
        audit.Setup(a => a.CompleteAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<int?>(),
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
        audit.Setup(a => a.AbandonAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
        audit.Setup(a => a.InterruptAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<int?>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
        return audit;
    }

    /// <summary>The bindings snapshot the tool records so the write stays reversible.</summary>
    private static Mock<IQueryHandler<GetModelTextureBindingsQuery, ModelTextureBindingSnapshot>> Bindings() =>
        Snapshot(Result.Success(new ModelTextureBindingSnapshot(7, string.Empty, [])));

    private static Mock<IQueryHandler<GetModelTextureBindingsQuery, ModelTextureBindingSnapshot>> Snapshot(
        Result<ModelTextureBindingSnapshot> result)
    {
        var handler = new Mock<IQueryHandler<GetModelTextureBindingsQuery, ModelTextureBindingSnapshot>>();
        handler.Setup(h => h.Handle(It.IsAny<GetModelTextureBindingsQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(result);
        return handler;
    }

    /// <summary>
    /// An associate handler that records its write through the unit of work, so the test can
    /// tell "committed" from "staged inside a transaction that later rolled back".
    /// </summary>
    private static Mock<ICommandHandler<AssociateTextureSetWithAllModelVersionsCommand>> Associate(
        FakeUnitOfWork unitOfWork)
    {
        var handler = new Mock<ICommandHandler<AssociateTextureSetWithAllModelVersionsCommand>>();
        handler.Setup(h => h.Handle(
                It.IsAny<AssociateTextureSetWithAllModelVersionsCommand>(), It.IsAny<CancellationToken>()))
            .Returns<AssociateTextureSetWithAllModelVersionsCommand, CancellationToken>((command, _) =>
            {
                unitOfWork.Write($"associated set {command.TextureSetId} with model {command.ModelId}");
                return Task.FromResult(Result.Success());
            });
        return handler;
    }

    private static Mock<ICommandHandler<SetDefaultTextureSetCommand, SetDefaultTextureSetResponse>> DefaultFails(
        Error error)
    {
        var handler = new Mock<ICommandHandler<SetDefaultTextureSetCommand, SetDefaultTextureSetResponse>>();
        handler.Setup(h => h.Handle(It.IsAny<SetDefaultTextureSetCommand>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Failure<SetDefaultTextureSetResponse>(error));
        return handler;
    }

    private static Mock<ICommandHandler<SetDefaultTextureSetCommand, SetDefaultTextureSetResponse>> DefaultSucceeds(
        FakeUnitOfWork unitOfWork)
    {
        var handler = new Mock<ICommandHandler<SetDefaultTextureSetCommand, SetDefaultTextureSetResponse>>();
        handler.Setup(h => h.Handle(It.IsAny<SetDefaultTextureSetCommand>(), It.IsAny<CancellationToken>()))
            .Returns<SetDefaultTextureSetCommand, CancellationToken>((command, _) =>
            {
                unitOfWork.Write($"default set {command.TextureSetId} on model {command.ModelId}");
                return Task.FromResult(Result.Success(
                    new SetDefaultTextureSetResponse(command.ModelId, 1, command.TextureSetId)));
            });
        return handler;
    }

    [Fact]
    public async Task A_Default_That_Fails_Undoes_The_Association_That_Already_Ran()
    {
        // The finding, exactly: association succeeds, setting the default fails. The
        // association must not survive - because the guard is about to release the key on
        // the strength of this being a failure that mutated nothing.
        var unitOfWork = new FakeUnitOfWork();
        var audit = ClaimGranted();

        var result = await AssetImportMcpTools.BindTextureSet(
            Associate(unitOfWork).Object,
            DefaultFails(new Error("NoActiveVersion", "Model 'probe' has no active version.")).Object,
            Bindings().Object,
            unitOfWork,
            audit.Object,
            Caller(),
            textureSetId: 5,
            modelId: 7,
            idempotencyKey: "bind-1");

        var json = Json(result);
        Assert.Contains("NoActiveVersion", json);

        // One transaction around both commands, and it rolled back.
        Assert.Equal(1, unitOfWork.Transactions);
        Assert.True(unitOfWork.RolledBack);
        Assert.Empty(unitOfWork.Durable);
    }

    [Fact]
    public async Task A_Default_That_Fails_Leaves_No_Durable_Write_Behind_The_Released_Key()
    {
        // The claim goes back as Failed, which is what makes the key retryable - and that
        // answer is only honest because the assertion above holds. Recorded together so a
        // change to either half has to face the other.
        var unitOfWork = new FakeUnitOfWork();
        var audit = ClaimGranted();

        await AssetImportMcpTools.BindTextureSet(
            Associate(unitOfWork).Object,
            DefaultFails(new Error("NoActiveVersion", "Model 'probe' has no active version.")).Object,
            Bindings().Object,
            unitOfWork,
            audit.Object,
            Caller(),
            textureSetId: 5,
            modelId: 7,
            idempotencyKey: "bind-2");

        audit.Verify(a => a.AbandonAsync("bind-2", "gen-1", It.IsAny<CancellationToken>()), Times.Once);
        audit.Verify(a => a.CompleteAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<int?>(),
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Never);
        Assert.Empty(unitOfWork.Durable);
    }

    [Fact]
    public async Task A_Bind_That_Works_Commits_Both_Writes_Together()
    {
        // The positive control. Without it, "nothing is durable" above is equally consistent
        // with a rollback and with the commands never reaching the unit of work at all.
        var unitOfWork = new FakeUnitOfWork();
        var audit = ClaimGranted();

        var result = await AssetImportMcpTools.BindTextureSet(
            Associate(unitOfWork).Object,
            DefaultSucceeds(unitOfWork).Object,
            Bindings().Object,
            unitOfWork,
            audit.Object,
            Caller(),
            textureSetId: 5,
            modelId: 7,
            idempotencyKey: "bind-3");

        Assert.Contains("\"ok\"", Json(result));
        Assert.Equal(1, unitOfWork.Transactions);
        Assert.False(unitOfWork.RolledBack);
        Assert.Equal(
            ["associated set 5 with model 7", "default set 5 on model 7"],
            unitOfWork.Durable);
        audit.Verify(a => a.CompleteAsync(
                "bind-3", "gen-1", It.IsAny<string>(), It.IsAny<int?>(),
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task An_Association_Only_Bind_Still_Commits_Inside_The_Transaction()
    {
        // setAsDefault=false is one write, but it goes through the same boundary - a second
        // path that skipped it would be a second thing to remember.
        var unitOfWork = new FakeUnitOfWork();
        var audit = ClaimGranted();
        var defaultHandler = new Mock<ICommandHandler<SetDefaultTextureSetCommand, SetDefaultTextureSetResponse>>();

        var result = await AssetImportMcpTools.BindTextureSet(
            Associate(unitOfWork).Object,
            defaultHandler.Object,
            Bindings().Object,
            unitOfWork,
            audit.Object,
            Caller(),
            textureSetId: 5,
            modelId: 7,
            idempotencyKey: "bind-4",
            setAsDefault: false);

        Assert.Contains("\"isDefault\":false", Json(result));
        Assert.Equal(1, unitOfWork.Transactions);
        Assert.Equal(["associated set 5 with model 7"], unitOfWork.Durable);
        defaultHandler.Verify(h => h.Handle(
            It.IsAny<SetDefaultTextureSetCommand>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task A_Failed_Association_Never_Reaches_The_Default()
    {
        // The order still matters: nothing is written, and the second command is not tried
        // against a model the first one could not bind.
        var unitOfWork = new FakeUnitOfWork();
        var associate = new Mock<ICommandHandler<AssociateTextureSetWithAllModelVersionsCommand>>();
        associate.Setup(h => h.Handle(
                It.IsAny<AssociateTextureSetWithAllModelVersionsCommand>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Failure(new Error("NoVersionsFound", "Model 7 has no versions.")));
        var defaultHandler = new Mock<ICommandHandler<SetDefaultTextureSetCommand, SetDefaultTextureSetResponse>>();

        var result = await AssetImportMcpTools.BindTextureSet(
            associate.Object,
            defaultHandler.Object,
            Bindings().Object,
            unitOfWork,
            ClaimGranted().Object,
            Caller(),
            textureSetId: 5,
            modelId: 7,
            idempotencyKey: "bind-5");

        Assert.Contains("NoVersionsFound", Json(result));
        Assert.Empty(unitOfWork.Durable);
        defaultHandler.Verify(h => h.Handle(
            It.IsAny<SetDefaultTextureSetCommand>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    /// <summary>
    /// A unit of work that models the one property these tests are about: a write made while
    /// a transaction is open becomes durable when it commits and is discarded when it rolls
    /// back. <see cref="Transactions"/> being zero is the pre-fix behaviour.
    /// </summary>
    private sealed class FakeUnitOfWork : IUnitOfWork
    {
        private readonly List<string> _staged = [];
        private bool _open;

        public List<string> Durable { get; } = [];

        public int Transactions { get; private set; }

        public bool RolledBack { get; private set; }

        /// <summary>Stands in for a command handler's commit.</summary>
        public void Write(string effect)
        {
            if (_open)
            {
                _staged.Add(effect);
            }
            else
            {
                Durable.Add(effect);
            }
        }

        public Task SaveChangesAsync(CancellationToken cancellationToken = default) => Task.CompletedTask;

        public async Task<Result<T>> InTransactionAsync<T>(
            Func<CancellationToken, Task<Result<T>>> work,
            CancellationToken cancellationToken = default)
        {
            Transactions++;
            _open = true;
            try
            {
                var result = await work(cancellationToken);
                if (result.IsFailure)
                {
                    RolledBack = true;
                    _staged.Clear();
                    return result;
                }

                Durable.AddRange(_staged);
                _staged.Clear();
                return result;
            }
            catch
            {
                RolledBack = true;
                _staged.Clear();
                throw;
            }
            finally
            {
                _open = false;
            }
        }
    }
}
