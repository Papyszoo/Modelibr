using System.Linq.Expressions;
using Application.Abstractions.Repositories;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Infrastructure.Repositories;

/// <summary>
/// The one idempotent-insert primitive behind every category tree's
/// <see cref="IHierarchicalCategoryRepository{TCategory}.AddRootAsync"/>.
///
/// <para>
/// It lives here, alone, for a reason worth stating: this file self-commits, and the six
/// category repositories that call it do not. Catching a unique violation requires
/// attempting the write, so the insert cannot be deferred to the handler's single commit -
/// but confining that to one shared helper keeps the exception to one entry in
/// <c>RepositoriesDontSelfCommitTests</c> rather than six, and keeps the repositories
/// themselves ordinary staging repositories.
/// </para>
///
/// <para>
/// The recovery read is deliberately a fresh query rather than anything cached: the row it
/// is looking for was committed by <b>another</b> transaction moments ago, so nothing this
/// context already tracked can contain it.
/// </para>
/// </summary>
internal static class CategoryRootInserts
{
    public static async Task<CategoryRootInsert<TCategory>> AddRootAsync<TCategory>(
        ApplicationDbContext context,
        DbSet<TCategory> set,
        TCategory candidate,
        Expression<Func<TCategory, bool>> sameRoot,
        CancellationToken cancellationToken)
        where TCategory : class, IHierarchicalCategory<TCategory>
    {
        set.Add(candidate);
        try
        {
            await context.SaveChangesAsync(cancellationToken);
            return new CategoryRootInsert<TCategory>(candidate, Created: true);
        }
        catch (DbUpdateException ex)
            when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            // Detach first: leaving the rejected row Added means the caller's next
            // SaveChanges retries the same doomed insert.
            context.Entry(candidate).State = EntityState.Detached;
        }

        var winner = await set.FirstOrDefaultAsync(sameRoot, cancellationToken);
        if (winner is null)
        {
            // The violation was real but the row is gone - deleted between the insert and
            // this read. Nothing sensible to hand back, so try once more from scratch;
            // a second failure propagates rather than looping.
            set.Add(candidate);
            await context.SaveChangesAsync(cancellationToken);
            return new CategoryRootInsert<TCategory>(candidate, Created: true);
        }

        return new CategoryRootInsert<TCategory>(winner, Created: false);
    }
}
