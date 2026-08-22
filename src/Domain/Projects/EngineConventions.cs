namespace Domain.Projects;

/// <summary>
/// How each engine's world differs from the project's authored convention (prompt 13-A).
///
/// <para>
/// A project has several engines by design - Blender for authoring, Unity for runtime - and
/// they disagree: Blender is 1 unit / Z-up / right-handed, Unity 1 / Y-up / left-handed,
/// Unreal 100 / Z-up / left-handed. That is exactly why the convention cannot be looked up
/// from "the engine": there isn't one. The project authors a convention, and this table
/// reports the conversion to each selected engine as a <b>fact</b>.
/// </para>
///
/// <para>
/// When the selected engines disagree, the brief <b>says so</b> rather than resolving it.
/// "Works in both" is a constraint the agent has to see and satisfy; an agent that cannot
/// see the conflict will satisfy exactly one of them and look correct doing it.
/// </para>
///
/// <para>
/// An engine with no entry here contributes no conversion line - never a guessed one.
/// </para>
/// </summary>
public static class EngineConventions
{
    public sealed record EngineConvention(string Engine, double UnitsPerMetre, string UpAxis, string Handedness);

    /// <summary>Modelibr's own, and the default a project authors against.</summary>
    public const double DefaultUnitsPerMetre = 1.0;
    public const string DefaultUpAxis = "Y";
    public const string DefaultHandedness = "right";

    private static readonly IReadOnlyDictionary<string, EngineConvention> Known =
        new Dictionary<string, EngineConvention>(StringComparer.OrdinalIgnoreCase)
        {
            ["Blender"] = new("Blender", 1.0, "Z", "right"),
            ["Unity"] = new("Unity", 1.0, "Y", "left"),
            ["Unreal"] = new("Unreal", 100.0, "Z", "left"),
            ["Godot"] = new("Godot", 1.0, "Y", "right"),
            ["three.js"] = new("three.js", 1.0, "Y", "right"),
        };

    public static EngineConvention? For(string engineName)
        => string.IsNullOrWhiteSpace(engineName)
            ? null
            : Known.TryGetValue(engineName.Trim(), out var convention) ? convention : null;

    /// <summary>The known conventions among a project's selected engines, in the order given.</summary>
    public static IReadOnlyList<EngineConvention> ForAll(IEnumerable<string> engineNames)
        => engineNames.Select(For).Where(c => c is not null).Select(c => c!).ToList();

    /// <summary>
    /// The axes on which the selected engines disagree with each other - what the brief has
    /// to state rather than resolve. Empty when they agree, or when fewer than two are known.
    /// </summary>
    public static IReadOnlyList<string> Conflicts(IEnumerable<string> engineNames)
    {
        var conventions = ForAll(engineNames);
        if (conventions.Count < 2) return Array.Empty<string>();

        var conflicts = new List<string>();

        if (conventions.Select(c => c.UpAxis).Distinct(StringComparer.OrdinalIgnoreCase).Count() > 1)
        {
            conflicts.Add(
                "up axis: " + string.Join(", ", conventions.Select(c => $"{c.Engine} {c.UpAxis}-up")));
        }

        if (conventions.Select(c => c.Handedness).Distinct(StringComparer.OrdinalIgnoreCase).Count() > 1)
        {
            conflicts.Add(
                "handedness: " + string.Join(", ", conventions.Select(c => $"{c.Engine} {c.Handedness}-handed")));
        }

        if (conventions.Select(c => c.UnitsPerMetre).Distinct().Count() > 1)
        {
            conflicts.Add(
                "scale: " + string.Join(", ", conventions.Select(
                    c => FormattableString.Invariant($"{c.Engine} {c.UnitsPerMetre} units/m"))));
        }

        return conflicts;
    }
}
