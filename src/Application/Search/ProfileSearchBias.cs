using Domain.Models;
using Domain.Projects;

namespace Application.Search;

/// <summary>How much of a project's profile <c>search_assets</c> applies (prompt 13-D3).</summary>
/// <remarks>
/// Three modes rather than a boolean, because the interesting failure is a silent one: a hard
/// budget filter that nobody asked for produces an agent that concludes the library has no
/// sofas. <see cref="Bias"/> only reorders, <see cref="Enforce"/> removes and says how much it
/// removed, and <see cref="Off"/> is the untouched behaviour every unlinked scene gets.
/// </remarks>
public static class AssetSearchProfileModes
{
    public const string Off = "off";
    public const string Bias = "bias";
    public const string Enforce = "enforce";

    public static readonly IReadOnlyList<string> All = new[] { Off, Bias, Enforce };

    public static string? Normalize(string? mode)
    {
        if (string.IsNullOrWhiteSpace(mode)) return null;
        var trimmed = mode.Trim();
        return All.FirstOrDefault(m => string.Equals(m, trimmed, StringComparison.OrdinalIgnoreCase));
    }
}

/// <summary>
/// A project's profile, reduced to the handful of things the search SQL can act on.
///
/// <para>
/// Everything here is a <i>reading</i> of the stored profile, assembled per query. Nothing is
/// persisted: <see cref="ProjectStyleSignals"/> is expected to be corrected, and a bias frozen
/// into a column would go on ranking by a mapping that has since changed.
/// </para>
/// </summary>
/// <param name="Styles">The project's declared styles, matched against an asset's own declared styles.</param>
/// <param name="BoostTokens">Tokens that rank an asset up. Already truncated to what ranking applies.</param>
/// <param name="PenaltyTokens">
/// Tokens that rank an asset down. <b>They demote; they never exclude</b> - the only hard
/// filter in this record is <paramref name="TriangleCap"/>, and only in <c>enforce</c>.
/// </param>
/// <param name="TriangleCap">
/// The per-asset triangle ceiling, reported in every mode and applied as a filter only in
/// <c>enforce</c>. Null when the project sets no budget and its styles imply none.
/// </param>
/// <param name="TriangleCapSource">
/// <c>budget</c> when the project stated the number, <c>style</c> when it was implied by the
/// chosen styles. A caller told it has been filtered has to be able to see which of the two
/// it can change.
/// </param>
/// <param name="DroppedTokens">
/// Tokens past the ranking slot limit. Reported rather than dropped silently, because a
/// caller comparing the applied lists against the project's styles would otherwise conclude
/// the mapping is wrong.
/// </param>
public sealed record ProfileSearchBias(
    int ProjectId,
    string ProjectName,
    string Mode,
    IReadOnlyList<string> Styles,
    IReadOnlyList<string> BoostTokens,
    IReadOnlyList<string> PenaltyTokens,
    int? TriangleCap,
    string? TriangleCapSource,
    string? FamilyHint,
    string? PreferredUvStatus,
    IReadOnlyList<string> DroppedTokens)
{
    /// <summary>True when the triangle cap is a filter rather than a report.</summary>
    public bool EnforcesBudget => TriangleCap is not null
                                  && string.Equals(Mode, AssetSearchProfileModes.Enforce, StringComparison.Ordinal);

    /// <summary>True when nothing in this profile can change a result. Ranking can then skip the work entirely.</summary>
    public bool IsInert => Styles.Count == 0
                           && BoostTokens.Count == 0
                           && PenaltyTokens.Count == 0
                           && !EnforcesBudget;
}

/// <summary>
/// Reduces a loaded project to the bias search applies (prompt 13-D3).
///
/// <para>
/// A pure function, so what a profile does to a search can be tested without a database - the
/// part of D3 that is a judgement (which cap wins, how many tokens rank, what an unmapped
/// style contributes) is all here rather than spread through the SQL.
/// </para>
/// </summary>
public static class ProfileSearchBiasBuilder
{
    /// <summary>
    /// How many boost and penalty tokens ranking can carry.
    ///
    /// <para>
    /// The search SQL matches a fixed number of slots because EF Core must translate a static
    /// shape - the same reason query terms are unrolled to six. Two built-in styles merge to
    /// at most eight tokens, which is what a project realistically selects; beyond that the
    /// extra tokens are reported as dropped rather than silently ignored.
    /// </para>
    /// </summary>
    public const int MaxRankedTokens = 8;

    public static ProfileSearchBias Build(Project project, string mode)
    {
        var styles = project.ProfileValues
            .Where(v => v.Option is not null
                        && string.Equals(v.Option.Dimension, ProjectProfileDimensions.Style, StringComparison.OrdinalIgnoreCase))
            .OrderBy(v => v.Option.SortOrder)
            .Select(v => v.Option.Name)
            .ToList();

        var signals = ProjectStyleSignals.Merge(styles);

        var boosts = signals.BoostTokens.Select(Normalize).Where(t => t.Length > 0).Distinct(StringComparer.Ordinal).ToList();
        var penalties = signals.PenaltyTokens.Select(Normalize).Where(t => t.Length > 0).Distinct(StringComparer.Ordinal).ToList();

        var dropped = boosts.Skip(MaxRankedTokens).Concat(penalties.Skip(MaxRankedTokens)).ToList();

        // An explicitly stated budget beats one implied by a style, and says so. The project
        // said 5,000; the style merely suggests what projects like this usually spend.
        var (cap, capSource) = project.MaxTrianglesPerAsset is int stated
            ? ((int?)stated, "budget")
            : signals.MaxTriangles is int implied
                ? ((int?)implied, "style")
                : (null, null);

        return new ProfileSearchBias(
            project.Id,
            project.Name,
            mode,
            styles,
            boosts.Take(MaxRankedTokens).ToList(),
            penalties.Take(MaxRankedTokens).ToList(),
            cap,
            capSource,
            signals.FamilyHint,
            signals.PreferredUvStatus,
            dropped);
    }

    /// <summary>
    /// What the profile did to this search, in a form a caller can act on (prompt 13-D3).
    /// </summary>
    /// <param name="removedByBudget">
    /// How many otherwise-matching assets the enforced cap removed, or null when nothing was
    /// enforced. The number is the whole point of <c>enforce</c> being allowed to filter at
    /// all: three results with no explanation is indistinguishable from an empty library.
    /// </param>
    public static AssetSearchProfileView Describe(ProfileSearchBias bias, int? removedByBudget)
    {
        var notes = new List<string>();

        if (bias.EnforcesBudget)
        {
            var cap = bias.TriangleCap!.Value;
            notes.Add(removedByBudget is > 0
                ? FormattableString.Invariant(
                    $"Enforcing {bias.ProjectName}'s {cap:N0}-triangle cap removed {removedByBudget} otherwise-matching asset(s). Pass applyProfile: \"bias\" to see them.")
                : FormattableString.Invariant(
                    $"Enforcing {bias.ProjectName}'s {cap:N0}-triangle cap removed nothing - no matching asset was over it."));
        }
        else if (string.Equals(bias.Mode, AssetSearchProfileModes.Enforce, StringComparison.Ordinal))
        {
            notes.Add($"{bias.ProjectName} sets no triangle budget and its styles imply none, so there was nothing to enforce. Ranking is still biased toward its style.");
        }
        else if (bias.TriangleCap is int reported)
        {
            notes.Add(FormattableString.Invariant(
                $"Ranking is biased toward {bias.ProjectName}'s style. Its {reported:N0}-triangle cap is reported on each hit as facts.profileFit, not applied - pass applyProfile: \"enforce\" to filter on it."));
        }
        else
        {
            notes.Add($"Ranking is biased toward {bias.ProjectName}'s style. It sets no triangle budget, so nothing was filtered.");
        }

        if (bias.Styles.Count == 0)
        {
            notes.Add("This project declares no style, so only its budget is in play.");
        }

        if (bias.DroppedTokens.Count > 0)
        {
            // Said out loud: a caller comparing this against the project's styles would
            // otherwise read the shorter list as the mapping being incomplete.
            notes.Add($"Ranking carries at most {MaxRankedTokens} tokens per list; {string.Join(", ", bias.DroppedTokens)} did not fit.");
        }

        if (bias.FamilyHint is not null)
        {
            notes.Add($"This project's style implies {bias.FamilyHint} assets - it is a hint, not a filter; pass assetType to act on it.");
        }

        return new AssetSearchProfileView(
            bias.Mode,
            Applied: true,
            ProjectId: bias.ProjectId,
            ProjectName: bias.ProjectName,
            Styles: bias.Styles,
            TriangleCap: bias.TriangleCap,
            TriangleCapSource: bias.TriangleCapSource,
            RemovedByBudget: removedByBudget,
            BoostTokens: bias.BoostTokens,
            PenaltyTokens: bias.PenaltyTokens,
            FamilyHint: bias.FamilyHint,
            Note: string.Join(" ", notes));
    }

    /// <summary>
    /// Puts a style token into the shape the index stores words in.
    ///
    /// <para>
    /// The document builder splits names on <c>-</c>, <c>_</c> and friends, so the indexed form
    /// of <c>hi-poly</c> is the two words <c>hi poly</c>. Matching the raw token would quietly
    /// find nothing for every hyphenated signal in the table - <c>hi-poly</c>, <c>8-bit</c>,
    /// <c>16-bit</c> - which is the failure that looks exactly like "the mapping is fine, the
    /// library just has none of those".
    /// </para>
    /// </summary>
    internal static string Normalize(string token)
        => string.Join(' ', (token ?? string.Empty)
                .ToLowerInvariant()
                .Split(new[] { ' ', '-', '_', '/', '\\', ',' }, StringSplitOptions.RemoveEmptyEntries));
}
