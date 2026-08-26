namespace Domain.Projects;

/// <summary>
/// The budget a platform selection <b>suggests</b> (prompt 13-A).
///
/// <para>
/// A suggestion, never a stored value. The project stores the number the user accepted,
/// because a number an agent is held to has to be a number the user saw - deriving it at
/// read time means the budget can change under a project without anyone touching it.
/// </para>
///
/// <para>
/// Platform is multi-valued, so the rule is the <b>minimum across every selected platform</b>,
/// and the suggestion names which platform set it. <c>PC + Meta Quest</c> is a common pair
/// with no sensible average: an asset that has to run on both has to fit the smaller one.
/// Naming the platform matters as much as the number - it is what tells the user that
/// dropping Quest is how you raise the budget.
/// </para>
/// </summary>
public static class PlatformBudgetDefaults
{
    /// <param name="Platform">Which selected platform set this number.</param>
    public sealed record BudgetSuggestion(int MaxTrianglesPerAsset, int MaxTextureSize, string Platform);

    private static readonly IReadOnlyDictionary<string, (int Triangles, int TextureSize)> ByPlatform =
        new Dictionary<string, (int, int)>(StringComparer.OrdinalIgnoreCase)
        {
            ["meta quest"] = (5_000, 1024),
            ["web"] = (5_000, 1024),
            ["ios"] = (10_000, 1024),
            ["android"] = (10_000, 1024),
            ["switch"] = (20_000, 2048),
            ["pc"] = (50_000, 2048),
            ["mac"] = (50_000, 2048),
            ["linux"] = (50_000, 2048),
            ["playstation"] = (50_000, 2048),
            ["xbox"] = (50_000, 2048),
        };

    /// <summary>
    /// The suggestion for a set of platforms, or null when none of them is one we have a
    /// figure for. Null means "we have nothing to suggest" - it must never be turned into a
    /// default, because an unconstrained project is a real and common answer.
    /// </summary>
    public static BudgetSuggestion? For(IEnumerable<string> platformNames)
    {
        BudgetSuggestion? tightest = null;

        foreach (var name in platformNames)
        {
            if (string.IsNullOrWhiteSpace(name)) continue;
            if (!ByPlatform.TryGetValue(name.Trim(), out var budget)) continue;

            if (tightest is null || budget.Triangles < tightest.MaxTrianglesPerAsset)
            {
                tightest = new BudgetSuggestion(budget.Triangles, budget.TextureSize, name.Trim());
            }
        }

        return tightest;
    }
}
