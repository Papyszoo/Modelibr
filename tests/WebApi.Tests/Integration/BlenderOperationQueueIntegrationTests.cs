using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Blender;
using Application.Extraction.Jobs;
using Application.Settings;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace WebApi.Tests.Integration;

/// <summary>
/// The operation queue against real PostgreSQL.
///
/// Its dedup guarantee lives in a filtered unique index, not in the handler: the handler's
/// check is a courtesy that avoids the round trip, and the index is what actually holds
/// when two callers ask at once. The InMemory provider enforces neither the filter nor the
/// uniqueness, so the interesting half - that a bake and an unwrap on ONE version are two
/// permitted rows - can only be proven here.
/// </summary>
[Trait("Category", "Integration")]
[Collection(PostgresIntegrationCollection.Name)]
public class BlenderOperationQueueIntegrationTests : IClassFixture<ModelibrWebFactory>
{
    private readonly ModelibrWebFactory _factory;

    public BlenderOperationQueueIntegrationTests(ModelibrWebFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Two_Operations_On_One_Version_Are_Two_Jobs()
    {
        var (modelId, versionId) = await SeedModelAsync();
        await SetBlenderEnabledAsync(true);

        var unwrap = await RequestAsync(modelId, BlenderOperations.UvUnwrap);
        var bake = await RequestAsync(modelId, BlenderOperations.BakeTextures);

        Assert.True(unwrap.IsSuccess);
        Assert.True(bake.IsSuccess);
        Assert.NotEqual(unwrap.Value.JobId, bake.Value.JobId);

        using var scope = _factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var jobs = await context.ExtractionJobs
            .Where(j => j.AssetId == modelId && j.ExtractorFamily == ExtractorFamilies.Blender)
            .ToListAsync();

        Assert.Equal(2, jobs.Count);
        Assert.All(jobs, j => Assert.Equal(versionId, j.VersionId));
        Assert.Contains(jobs, j => j.Operation == BlenderOperations.UvUnwrap);
        Assert.Contains(jobs, j => j.Operation == BlenderOperations.BakeTextures);
    }

    [Fact]
    public async Task Asking_For_The_Same_Operation_Twice_Queues_It_Once()
    {
        var (modelId, _) = await SeedModelAsync();
        await SetBlenderEnabledAsync(true);

        var first = await RequestAsync(modelId, BlenderOperations.UvUnwrap);
        var second = await RequestAsync(modelId, BlenderOperations.UvUnwrap);

        Assert.True(first.IsSuccess);
        Assert.True(second.IsSuccess);
        Assert.False(first.Value.AlreadyQueued);
        Assert.True(second.Value.AlreadyQueued);
        Assert.Equal(first.Value.JobId, second.Value.JobId);

        using var scope = _factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var count = await context.ExtractionJobs.CountAsync(
            j => j.AssetId == modelId && j.Operation == BlenderOperations.UvUnwrap);
        Assert.Equal(1, count);
    }

    [Fact]
    public async Task Nothing_Is_Queued_When_Blender_Is_Not_Installed()
    {
        var (modelId, _) = await SeedModelAsync();
        await SetBlenderEnabledAsync(false);

        var result = await RequestAsync(modelId, BlenderOperations.UvUnwrap);

        Assert.True(result.IsFailure);
        Assert.Equal("Blender.NotAvailable", result.Error.Code);

        using var scope = _factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        Assert.False(await context.ExtractionJobs.AnyAsync(j => j.AssetId == modelId));
    }

    [Fact]
    public async Task A_Finished_Operation_Keeps_What_It_Produced()
    {
        var (modelId, _) = await SeedModelAsync();
        await SetBlenderEnabledAsync(true);
        var queued = await RequestAsync(modelId, BlenderOperations.UvUnwrap);

        using (var scope = _factory.Services.CreateScope())
        {
            var repo = scope.ServiceProvider.GetRequiredService<IExtractionJobRepository>();
            var uow = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();
            var job = await repo.GetByIdAsync(queued.Value.JobId);
            job!.TryClaim("worker-1", DateTime.UtcNow);
            await repo.UpdateAsync(job);
            await uow.SaveChangesAsync();

            var finish = scope.ServiceProvider
                .GetRequiredService<ICommandHandler<FinishExtractionJobCommand>>();
            var finished = await finish.Handle(
                new FinishExtractionJobCommand(
                    job.Id, "worker-1", Success: true,
                    ResultJson: "{\"versionId\":1904,\"meshesUnwrapped\":7}"),
                CancellationToken.None);
            Assert.True(finished.IsSuccess);
        }

        using (var scope = _factory.Services.CreateScope())
        {
            var status = scope.ServiceProvider
                .GetRequiredService<IQueryHandler<GetOperationJobQuery, OperationJobView>>();
            var view = await status.Handle(
                new GetOperationJobQuery(queued.Value.JobId), CancellationToken.None);

            Assert.True(view.IsSuccess);
            Assert.Equal("Done", view.Value.Status);
            Assert.Equal(BlenderOperations.UvUnwrap, view.Value.Operation);
            // The result crosses back as JSON, not as a string holding JSON - a caller
            // reads result.versionId rather than parsing a quoted blob.
            Assert.Equal(1904, view.Value.Result!["versionId"]!.GetValue<int>());
        }
    }

    // ---- fixtures ---------------------------------------------------------------

    private async Task<SharedKernel.Result<BlenderOperationRequested>> RequestAsync(
        int modelId, string operation)
    {
        using var scope = _factory.Services.CreateScope();
        var handler = scope.ServiceProvider
            .GetRequiredService<ICommandHandler<RequestBlenderOperationCommand, BlenderOperationRequested>>();
        return await handler.Handle(
            new RequestBlenderOperationCommand(modelId, operation), CancellationToken.None);
    }

    private async Task<(int ModelId, int VersionId)> SeedModelAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await context.Database.MigrateAsync();

        var model = Model.Create($"unwrap-fixture-{Guid.NewGuid():N}", DateTime.UtcNow);
        context.Models.Add(model);
        await context.SaveChangesAsync();

        var version = ModelVersion.Create(model.Id, 1, "seed", DateTime.UtcNow);
        context.ModelVersions.Add(version);
        await context.SaveChangesAsync();

        model.SetActiveVersion(version.Id, DateTime.UtcNow);
        await context.SaveChangesAsync();

        return (model.Id, version.Id);
    }

    private async Task SetBlenderEnabledAsync(bool enabled)
    {
        using var scope = _factory.Services.CreateScope();
        var repo = scope.ServiceProvider.GetRequiredService<ISettingRepository>();
        var uow = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();

        var existing = await repo.GetByKeyAsync(SettingKeys.BlenderEnabled);
        if (existing is null)
        {
            await repo.AddAsync(Setting.Create(SettingKeys.BlenderEnabled, enabled ? "true" : "false", DateTime.UtcNow));
        }
        else
        {
            existing.UpdateValue(enabled ? "true" : "false", DateTime.UtcNow);
            await repo.UpdateAsync(existing);
        }
        await uow.SaveChangesAsync();
    }
}
