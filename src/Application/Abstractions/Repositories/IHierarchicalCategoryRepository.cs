using Domain.Models;

namespace Application.Abstractions.Repositories;

/// <summary>
/// A root-category insert, and which row the caller ended up with.
/// </summary>
/// <param name="Category">
/// The root that now holds the name - this caller's row when
/// <paramref name="Created"/>, or the one a concurrent caller inserted first.
/// </param>
/// <param name="Created">False when the name was already taken and this is somebody else's row.</param>
public sealed record CategoryRootInsert<TCategory>(TCategory Category, bool Created)
    where TCategory : class;

/// <summary>
/// Generic repository interface for hierarchical category entities.
/// Concrete category repositories extend this with their specific type.
/// </summary>
public interface IHierarchicalCategoryRepository<TCategory>
    where TCategory : class, IHierarchicalCategory<TCategory>
{
    Task<TCategory> AddAsync(TCategory category, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<TCategory>> GetAllAsync(CancellationToken cancellationToken = default);
    Task<TCategory?> GetByIdAsync(int id, CancellationToken cancellationToken = default);
    Task<TCategory?> GetByNameAsync(string name, int? parentId, CancellationToken cancellationToken = default);
    Task UpdateAsync(TCategory category, CancellationToken cancellationToken = default);
    Task DeleteAsync(TCategory category, CancellationToken cancellationToken = default);

    /// <summary>
    /// Inserts a <b>root</b> category and commits it, or - when another caller inserted a
    /// root of the same name in the meantime - discards this one and returns theirs.
    /// </summary>
    /// <remarks>
    /// A read-then-create is a check-then-act, and for roots the database used to have no
    /// opinion: the unique index is on (ParentId, Name) and PostgreSQL treats NULLs as
    /// distinct, so two transactions inserting a root called "Vehicles" both succeeded.
    /// Uploading a folder sends its models in parallel, which is precisely that shape, and
    /// the result was a permanently split category somebody had to merge by hand.
    ///
    /// Reconciling afterwards - scan, pick the lowest id, delete the rest - does not close
    /// it either: the higher-id transaction can run its scan before the lower-id one
    /// commits, see nothing to defer to, and keep its own row. Both roots survive.
    ///
    /// So the database enforces it (a unique index over the lowered name, restricted to
    /// roots) and this is the operation that lives with the consequence: insert, and if the
    /// index says somebody won, take the winner. The losing row never exists, so nothing
    /// has to be remapped or deleted, and both callers come away pointing at the same
    /// category.
    ///
    /// Takes an entity rather than a name because a kinded tree (texture sets) partitions
    /// its roots by kind, and the candidate is the only thing that knows which kind this is.
    /// The insert is committed here, unlike <see cref="AddAsync"/>: catching the violation
    /// is the whole point, and a violation cannot be caught before the write is attempted.
    /// </remarks>
    Task<CategoryRootInsert<TCategory>> AddRootAsync(
        TCategory candidate, CancellationToken cancellationToken = default);
}
