namespace Application.Abstractions;

/// <summary>
/// Detaches every entity tracked by the current unit of work. Long-running orchestrations
/// that reuse one scope across many steps (the store importer) call this after a failed
/// step: an exception thrown between staging and <c>SaveChangesAsync</c> would otherwise
/// leave poisoned entities in the tracker that make every later save in the same scope
/// re-attempt (and re-fail) the doomed insert. Implemented by <c>ApplicationDbContext</c>.
/// </summary>
public interface IChangeTrackerReset
{
    void Clear();
}
