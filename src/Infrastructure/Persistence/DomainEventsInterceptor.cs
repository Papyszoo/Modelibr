using Application.Abstractions.Services;
using Domain.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Logging;

namespace Infrastructure.Persistence;

/// <summary>
/// The single place domain events are dispatched from. Collects
/// <c>DomainEvents</c> from tracked <see cref="AggregateRoot"/> instances and
/// publishes them AFTER a successful commit, then clears them. Command
/// handlers never call <c>IDomainEventDispatcher</c> or
/// <c>ClearDomainEvents</c> themselves - see the backend-patterns skill
/// (Domain events section).
///
/// Dispatch-after-commit (not inside the same transaction) matches the
/// pre-existing behavior: handlers used to dispatch manually only after
/// their repositories had already self-committed. None of the current
/// <c>IDomainEventHandler</c>s need to join the original transaction -
/// <c>ActiveVersionChangedEventHandler</c> and
/// <c>ThumbnailStatusChangedEventHandler</c> only push SignalR notifications,
/// and <c>ModelUploadedEventHandler</c>'s DB write (enqueuing a thumbnail
/// job) is intentionally a separate, subsequent operation - it should only
/// happen once the upload it reacts to is durable.
///
/// The crash window between commit and dispatch is not closed by this (no
/// outbox - see prompt 25 notes); that's an accepted, documented tradeoff
/// for a local-first app.
///
/// Registered per-DbContext-scope (Scoped in DI - see
/// Infrastructure/DependencyInjection.cs), never Singleton: the recursion
/// guard below is instance state and must not leak across requests.
/// </summary>
public sealed class DomainEventsInterceptor : SaveChangesInterceptor
{
    // Safety net against a future handler accidentally creating an event/write
    // cycle. No current handler chain needs more than one extra round
    // (ModelUploadedEventHandler enqueuing a ThumbnailJob, which is not an
    // AggregateRoot and raises nothing further). Tracked as instance state
    // because it must survive the recursive SaveChangesAsync call below
    // re-entering this same interceptor.
    private const int MaxDispatchRounds = 10;

    private readonly IDomainEventDispatcher _dispatcher;
    private readonly ILogger<DomainEventsInterceptor> _logger;
    private int _dispatchDepth;

    public DomainEventsInterceptor(IDomainEventDispatcher dispatcher, ILogger<DomainEventsInterceptor> logger)
    {
        _dispatcher = dispatcher ?? throw new ArgumentNullException(nameof(dispatcher));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    public override async ValueTask<int> SavedChangesAsync(
        SaveChangesCompletedEventData eventData,
        int result,
        CancellationToken cancellationToken = default)
    {
        if (eventData.Context is not null)
        {
            _dispatchDepth++;
            try
            {
                if (_dispatchDepth > MaxDispatchRounds)
                {
                    _logger.LogError(
                        "Domain event dispatch exceeded {MaxRounds} rounds after a single SaveChanges - " +
                        "a handler is likely re-raising events or re-staging writes in a loop. Stopping " +
                        "to avoid unbounded recursion; remaining changes are NOT flushed.",
                        MaxDispatchRounds);
                }
                else
                {
                    await DispatchDomainEventsAsync(eventData.Context, cancellationToken);
                }
            }
            finally
            {
                _dispatchDepth--;
            }
        }

        return await base.SavedChangesAsync(eventData, result, cancellationToken);
    }

    private async Task DispatchDomainEventsAsync(DbContext context, CancellationToken cancellationToken)
    {
        var aggregatesWithEvents = context.ChangeTracker
            .Entries<AggregateRoot>()
            .Select(e => e.Entity)
            .Where(a => a.DomainEvents.Count > 0)
            .ToList();

        if (aggregatesWithEvents.Count == 0)
        {
            return;
        }

        var domainEvents = aggregatesWithEvents.SelectMany(a => a.DomainEvents).ToList();
        foreach (var aggregate in aggregatesWithEvents)
        {
            aggregate.ClearDomainEvents();
        }

        await _dispatcher.PublishAsync(domainEvents, cancellationToken);

        // A handler may have staged further writes while reacting to the
        // event (e.g. ModelUploadedEventHandler enqueuing a ThumbnailJob).
        // Flush them so they aren't silently dropped now that repositories
        // no longer self-commit. SaveChangesAsync re-enters this
        // interceptor, so any domain events THAT save raises get dispatched
        // too - this settles naturally once a round is a no-op.
        if (context.ChangeTracker.HasChanges())
        {
            await context.SaveChangesAsync(cancellationToken);
        }
    }
}
