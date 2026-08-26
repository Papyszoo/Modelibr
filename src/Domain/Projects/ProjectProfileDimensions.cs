namespace Domain.Projects;

/// <summary>
/// The dimensions of a project's profile - one shared vocabulary table, five dimensions
/// (prompt 13-B), rather than five tables that would each need their own endpoint, query,
/// DTO and picker before a sixth dimension could exist.
///
/// <para>
/// <b>Cardinality is declared here and enforced in the domain</b>, not in the schema. A
/// dimension changing from single- to multi-valued is then a rule change, not a migration.
/// </para>
/// </summary>
public static class ProjectProfileDimensions
{
    /// <summary>Engines the project's assets have to work in. Each carries an optional role.</summary>
    public const string Engine = "engine";

    /// <summary>Platforms shipped to. On its own it decides nothing - it decides the budget.</summary>
    public const string Platform = "platform";

    public const string Genre = "genre";

    /// <summary>How the project looks. The dimension with the most influence on which asset gets picked.</summary>
    public const string Style = "style";

    /// <summary>Camera perspective, which is also the signal that a project wants sprites rather than models.</summary>
    public const string Perspective = "perspective";

    public static readonly IReadOnlyList<string> All = new[]
    {
        Engine, Platform, Genre, Style, Perspective
    };

    /// <summary>
    /// Dimensions on whose assignment a <c>Role</c> ("authoring", "runtime", "preview") is
    /// meaningful. Only engine uses it today: a project is Blender <i>and</i> Unity, and
    /// which one is which is what tells an agent what format to hand back.
    /// </summary>
    public static bool SupportsRole(string dimension)
        => string.Equals(dimension, Engine, StringComparison.OrdinalIgnoreCase);

    public static bool IsKnown(string? dimension)
        => dimension is not null
           && All.Any(d => string.Equals(d, dimension.Trim(), StringComparison.OrdinalIgnoreCase));

    public static string? Normalize(string? dimension)
    {
        if (string.IsNullOrWhiteSpace(dimension)) return null;
        var trimmed = dimension.Trim();
        return All.FirstOrDefault(d => string.Equals(d, trimmed, StringComparison.OrdinalIgnoreCase));
    }
}
