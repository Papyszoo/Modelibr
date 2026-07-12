using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Persistence;

/// <summary>
/// Shared entity-tracking guard for repository UpdateAsync methods (prompt 25
/// unit-of-work follow-up). Repositories stage mutations only — they don't call
/// SaveChangesAsync — so a single request can chain AddAsync and UpdateAsync on
/// the same aggregate before the handler ever commits. AddAsync leaves that
/// aggregate tracked as Added with a temporary (not yet DB-assigned) key.
/// Calling <c>DbSet&lt;T&gt;.Update()</c> on it forces the state to Modified
/// while the key is still temporary, which throws:
/// "The property '{Entity}.Id' has a temporary value while attempting to
/// change the entity's state to 'Modified'. Either set a permanent value
/// explicitly, or ensure that the database is configured to generate values
/// for this property."
/// </summary>
internal static class DbContextTrackingExtensions
{
    /// <summary>
    /// Stages <paramref name="entity"/> for an update only when it is not
    /// already tracked by the context. A tracked entity (Added, Modified, or
    /// Unchanged-with-property-changes) is already going to be persisted in
    /// its current state by the next SaveChangesAsync — no extra call is
    /// needed. Only a genuinely Detached entity (loaded/rehydrated outside
    /// this context, e.g. across scopes) needs to be attached and marked
    /// Modified explicitly; that's what Update() is for, and this still does
    /// it in that case.
    /// </summary>
    public static void UpdateIfDetached<TEntity>(this DbContext context, TEntity entity)
        where TEntity : class
    {
        if (context.Entry(entity).State == EntityState.Detached)
        {
            context.Set<TEntity>().Update(entity);
        }
    }
}
