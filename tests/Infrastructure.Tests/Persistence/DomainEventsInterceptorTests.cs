using Application.Abstractions.Messaging;
using Application.Abstractions.Services;
using Domain.Events;
using Domain.Models;
using Infrastructure.Persistence;
using Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using SharedKernel;
using Xunit;

namespace Infrastructure.Tests.Persistence;

/// <summary>
/// Covers prompt 25 part B: DomainEventsInterceptor is the ONLY place domain
/// events are dispatched from. These tests exercise the interceptor directly
/// against a real ApplicationDbContext/SaveChanges pipeline - command handlers
/// that raise events (e.g. EnvironmentMap.Create) contain zero dispatch code;
/// this is what makes that possible.
/// </summary>
public class DomainEventsInterceptorTests
{
    private static ApplicationDbContext NewContext(params SaveChangesInterceptor[] interceptors)
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .AddInterceptors(interceptors)
            .Options;
        var context = new ApplicationDbContext(options);
        context.Database.EnsureCreated();
        return context;
    }

    [Fact]
    public async Task SaveChanges_EventRaisedOnAggregate_IsHandledWithNoDispatchCodeInCaller()
    {
        // Arrange: a real dispatcher + a real handler, wired through DI exactly as
        // production does (Application/DependencyInjection.cs assembly-scans
        // IDomainEventHandler<> implementations). The only "dispatch code" anywhere
        // is the interceptor - this test's Act is just SaveChangesAsync.
        var handler = new RecordingHandler();
        var services = new ServiceCollection();
        services.AddSingleton<IDomainEventHandler<EnvironmentMapCreatedEvent>>(handler);
        var serviceProvider = services.BuildServiceProvider();
        var dispatcher = new DomainEventDispatcher(serviceProvider, NullLogger<DomainEventDispatcher>.Instance);
        var interceptor = new DomainEventsInterceptor(dispatcher, NullLogger<DomainEventsInterceptor>.Instance);

        await using var context = NewContext(interceptor);

        var environmentMap = EnvironmentMap.Create("Sunset", DateTime.UtcNow);
        context.EnvironmentMaps.Add(environmentMap);

        // Act - no PublishAsync/ClearDomainEvents call anywhere in this test either;
        // that's the point.
        await context.SaveChangesAsync();

        // Assert
        var handled = Assert.Single(handler.Handled);
        // EnvironmentMapCreatedEvent captures Id at construction time inside
        // EnvironmentMap.Create - before the entity is tracked/saved - so it's
        // always 0, independent of this PR; that's a pre-existing characteristic
        // of this event, not something dispatch-after-commit changes.
        Assert.Equal(0, handled.EnvironmentMapId);
        Assert.Equal("Sunset", handled.Name);
        Assert.Empty(environmentMap.DomainEvents); // cleared after dispatch
    }

    [Fact]
    public async Task SaveChanges_MultipleAggregatesWithEvents_DispatchesAllAndClearsAll()
    {
        var handler = new RecordingHandler();
        var services = new ServiceCollection();
        services.AddSingleton<IDomainEventHandler<EnvironmentMapCreatedEvent>>(handler);
        var dispatcher = new DomainEventDispatcher(services.BuildServiceProvider(), NullLogger<DomainEventDispatcher>.Instance);
        var interceptor = new DomainEventsInterceptor(dispatcher, NullLogger<DomainEventsInterceptor>.Instance);

        await using var context = NewContext(interceptor);

        var first = EnvironmentMap.Create("First", DateTime.UtcNow);
        var second = EnvironmentMap.Create("Second", DateTime.UtcNow);
        context.EnvironmentMaps.AddRange(first, second);

        await context.SaveChangesAsync();

        Assert.Equal(2, handler.Handled.Count);
        Assert.Contains(handler.Handled, e => e.Name == "First");
        Assert.Contains(handler.Handled, e => e.Name == "Second");
        Assert.Empty(first.DomainEvents);
        Assert.Empty(second.DomainEvents);
    }

    [Fact]
    public async Task SaveChanges_Fails_DispatchesNothing()
    {
        // A second interceptor throws in the "before save" hook, so the physical
        // write never happens and DomainEventsInterceptor.SavedChangesAsync (which
        // only runs after a successful commit) is never invoked.
        var mockDispatcher = new Mock<IDomainEventDispatcher>();
        var interceptor = new DomainEventsInterceptor(mockDispatcher.Object, NullLogger<DomainEventsInterceptor>.Instance);
        var throwingInterceptor = new ThrowingBeforeSaveInterceptor();

        await using var context = NewContext(interceptor, throwingInterceptor);

        var environmentMap = EnvironmentMap.Create("NeverSaved", DateTime.UtcNow);
        context.EnvironmentMaps.Add(environmentMap);

        await Assert.ThrowsAsync<InvalidOperationException>(() => context.SaveChangesAsync());

        mockDispatcher.Verify(
            x => x.PublishAsync(It.IsAny<IEnumerable<IDomainEvent>>(), It.IsAny<CancellationToken>()),
            Times.Never);

        // The event is still sitting on the aggregate - nothing silently dropped it,
        // the whole SaveChanges just never got that far.
        Assert.Single(environmentMap.DomainEvents);
    }

    [Fact]
    public async Task SaveChanges_HandlerStagesFurtherWrites_FlushesThem()
    {
        // Mirrors ModelUploadedEventHandler enqueuing a ThumbnailJob: a handler
        // reacting to one event stages an unrelated write on an entity that
        // raises no domain event of its own (like ThumbnailJob, not an
        // AggregateRoot). That write must not be silently dropped now that
        // repositories don't self-commit.
        ApplicationDbContext? capturedContext = null;
        var stagedOnce = false;
        var mockDispatcher = new Mock<IDomainEventDispatcher>();
        mockDispatcher
            .Setup(x => x.PublishAsync(It.IsAny<IEnumerable<IDomainEvent>>(), It.IsAny<CancellationToken>()))
            .Callback<IEnumerable<IDomainEvent>, CancellationToken>((_, _) =>
            {
                if (stagedOnce)
                {
                    return;
                }

                stagedOnce = true;
                // Setting doesn't raise domain events, so this round-trips through
                // exactly one extra SaveChanges - it terminates on its own.
                capturedContext!.Settings.Add(Setting.Create("staged-during-dispatch", "value", DateTime.UtcNow));
            })
            .ReturnsAsync(Result.Success());

        var interceptor = new DomainEventsInterceptor(mockDispatcher.Object, NullLogger<DomainEventsInterceptor>.Instance);
        await using var context = NewContext(interceptor);
        capturedContext = context;

        context.EnvironmentMaps.Add(EnvironmentMap.Create("Trigger", DateTime.UtcNow));

        await context.SaveChangesAsync();

        // Dispatched exactly once (for "Trigger" - Setting raises no events of its
        // own), but the Setting staged during that dispatch was still flushed by
        // the interceptor's follow-up SaveChanges.
        mockDispatcher.Verify(
            x => x.PublishAsync(It.IsAny<IEnumerable<IDomainEvent>>(), It.IsAny<CancellationToken>()),
            Times.Once);

        Assert.True(await context.Settings.AnyAsync(s => s.Key == "staged-during-dispatch"));
    }

    [Fact]
    public async Task SaveChanges_HandlerFails_DiscardsUnsavedChangesAndPostCommitTail()
    {
        ApplicationDbContext? capturedContext = null;
        var actions = new PostCommitActions(NullLogger<PostCommitActions>.Instance);
        var ranActions = new List<string>();

        var mockDispatcher = new Mock<IDomainEventDispatcher>();
        mockDispatcher
            .Setup(x => x.PublishAsync(It.IsAny<IEnumerable<IDomainEvent>>(), It.IsAny<CancellationToken>()))
            .Callback<IEnumerable<IDomainEvent>, CancellationToken>((_, _) =>
            {
                capturedContext!.Settings.Add(Setting.Create("failed-handler-setting", "value", DateTime.UtcNow));
                actions.Enqueue("failed-handler-action", () => ranActions.Add("action-ran"));
            })
            .ReturnsAsync(Result.Failure(new Error("HandlerFailed", "Handler encountered an error")));

        var interceptor = new DomainEventsInterceptor(mockDispatcher.Object, actions, NullLogger<DomainEventsInterceptor>.Instance);
        await using var context = NewContext(interceptor);
        capturedContext = context;

        context.EnvironmentMaps.Add(EnvironmentMap.Create("Trigger", DateTime.UtcNow));

        await context.SaveChangesAsync();

        // The staged entity was discarded/detached and not persisted
        Assert.False(await context.Settings.AnyAsync(s => s.Key == "failed-handler-setting"));
        Assert.False(context.ChangeTracker.HasChanges());

        // The post-commit tail was discarded
        await actions.RunPendingAsync();
        Assert.Empty(ranActions);
    }

    private sealed class RecordingHandler : IDomainEventHandler<EnvironmentMapCreatedEvent>
    {
        public List<EnvironmentMapCreatedEvent> Handled { get; } = new();

        public Task<Result> Handle(EnvironmentMapCreatedEvent domainEvent, CancellationToken cancellationToken)
        {
            Handled.Add(domainEvent);
            return Task.FromResult(Result.Success());
        }
    }

    private sealed class ThrowingBeforeSaveInterceptor : SaveChangesInterceptor
    {
        public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
            DbContextEventData eventData,
            InterceptionResult<int> result,
            CancellationToken cancellationToken = default)
            => throw new InvalidOperationException("Simulated save failure");
    }
}
