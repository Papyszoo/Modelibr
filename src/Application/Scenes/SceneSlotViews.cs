using Domain.Scenes;

namespace Application.Scenes;

/// <summary>
/// One proposal, as the user reads it on a card.
///
/// Both halves matter and neither substitutes for the other: <see cref="Rationale"/> is the
/// agent's argument, and <see cref="Facts"/> is the evidence. A rationale on its own is a
/// plausible sentence about an asset nobody measured, and it is exactly what a user cannot
/// overrule - "reads as rundown" sounds right whether the asset is a 900-triangle lamp post
/// or a twelve-object test scene with two lights in it.
/// </summary>
/// <param name="Ref">
/// The name a user says out loud - <c>streetlight/B</c>. Sent already assembled so the card,
/// the agent's prose and the tool arguments cannot spell it three different ways.
/// </param>
/// <param name="StoreAsset">
/// Set when this proposal is something the library does not hold yet. Mutually exclusive
/// with <paramref name="Asset"/>, and the reason <paramref name="Choosable"/> exists.
/// </param>
/// <param name="Choosable">
/// Whether the user can settle the slot with this candidate as it stands. False for a store
/// proposal: choosing it means acquiring it first, which is a different act with a cost and
/// a download attached, and the card must not offer it as the same one-click choice.
/// </param>
/// <param name="Media">What the card can draw. Absent when there is nothing to draw.</param>
/// <param name="Recommended">
/// The agent advises this one. Never <paramref name="Chosen"/> by implication: a card can be
/// recommended and not chosen, chosen and not recommended, or both - and the three read
/// differently to a user deciding whether they were followed or overruled.
/// </param>
/// <param name="ProfileFit">
/// How this candidate measures against the project the scene belongs to (prompt 13-D5), or
/// null when it belongs to none. <b>Derived here, never taken from the rationale</b>: the
/// numbers are what let a user overrule a plausible-sounding wrong answer, and a number the
/// agent typed is a number the agent could have typed wrong.
/// </param>
public sealed record SceneSlotCandidateView(
    string Id,
    string Ref,
    string? Label,
    SceneAssetRef? Asset,
    SceneMaterialBinding? Material,
    string? Rationale,
    bool Chosen,
    bool Rejected,
    string? RejectedReason,
    SceneCandidateFacts? Facts,
    SceneStoreAssetRef? StoreAsset = null,
    bool Choosable = true,
    SceneCandidateMedia? Media = null,
    SceneCandidateProfileFit? ProfileFit = null,
    bool Recommended = false);

/// <summary>
/// A candidate measured against its scene's project (prompt 13-D5).
///
/// <para>
/// A candidate that violates the profile is still allowed to be proposed - it says so instead
/// of being dropped. The point is not to gate the agent's suggestions, it is that the user
/// deciding between two cards can see what each one is being measured against.
/// </para>
/// </summary>
/// <param name="WithinBudget">
/// Null when the project sets no per-asset budget, or when nothing measured the asset. Neither
/// is "over" and neither is "within".
/// </param>
/// <param name="DeclaresProjectStyle">True when the asset's own declared styles include one of the project's.</param>
/// <param name="Contradicts">
/// Declared styles the project's styles rule out. Empty for an asset nobody has described -
/// silence about an asset is not evidence against it.
/// </param>
/// <param name="Summary">The line a card prints, assembled from the fields above.</param>
public sealed record SceneCandidateProfileFit(
    string ProjectName,
    int? Triangles,
    int? Budget,
    bool? WithinBudget,
    bool DeclaresProjectStyle,
    IReadOnlyList<string> Contradicts,
    string Summary);

/// <summary>
/// The measurable half of a proposal: what the library actually knows about the asset behind
/// the card.
///
/// Read from the same two providers the scene validator uses, so a candidate cannot look
/// better on a choice card than the identical node looks after it is chosen.
/// </summary>
/// <param name="Name">The asset's own name, when it has one.</param>
/// <param name="Dimensions">Its bounds in metres, before any scene transform - the number that catches a "rug" the size of a house.</param>
/// <param name="PartCount">Parts in its scene graph. A double-digit count on a single prop is the sample-scene smell.</param>
/// <param name="MaterialCount">Distinct materials it declares.</param>
/// <param name="QualityFlags">The derive step's flags - <c>missing_uvs</c>, <c>no_geometry</c> and friends.</param>
/// <param name="Cameras">How many cameras it contains. Anything above zero means this is a scene, not a prop.</param>
/// <param name="Lights">How many lights it contains, for the same reason.</param>
public sealed record SceneCandidateFacts(
    string? Name = null,
    Vec3? Dimensions = null,
    int? PartCount = null,
    int? MaterialCount = null,
    IReadOnlyList<string>? QualityFlags = null,
    int Cameras = 0,
    int Lights = 0);

/// <summary>One open decision, its proposals, and where it stands.</summary>
/// <param name="NodeId">The node in the scene this slot decides. Always present on a stored slot - a slot with no node fails validation.</param>
/// <param name="Status">From <see cref="SceneSlotStatuses"/>, derived from the candidates rather than stored beside them.</param>
/// <param name="RecommendedCandidateId">
/// What the agent advises. Distinct from <paramref name="ChosenCandidateId"/> in both meaning
/// and presentation: "recommended" and "chosen" are different states, and a card that looked
/// selected because it was recommended would misreport who decided.
/// </param>
/// <param name="RecommendationAcceptable">
/// Whether a bulk accept may act on this slot's recommendation - it exists, the slot is
/// unresolved, and the candidate is neither rejected nor a store proposal. Computed here so
/// the panel, the endpoint and the tests cannot disagree about it.
/// </param>
public sealed record SceneSlotView(
    string SlotId,
    string? NodeId,
    string? Brief,
    string Status,
    string? ChosenCandidateId,
    string? ResolvedBy,
    string? ReopenedReason,
    IReadOnlyList<SceneSlotCandidateView> Candidates,
    string? RecommendedCandidateId = null,
    bool RecommendationAcceptable = false);

/// <summary>Every decision in a scene that is still, or was ever, the user's to make.</summary>
/// <param name="RecommendationSummary">
/// The authored line about the recommended set as a whole. Shown verbatim; the browser does
/// not synthesize prose about a set of cards.
/// </param>
public sealed record SceneSlotsView(
    SceneSummary Scene,
    IReadOnlyList<SceneSlotView> Slots,
    string? RecommendationSummary = null);

/// <summary>The response every slot write returns: the scene's new revision, and the slot as it now stands.</summary>
public sealed record SceneSlotResponse(SceneSummary Scene, SceneSlotView Slot);

/// <summary>Turns stored slots into the views above, folding in what the library knows about each candidate.</summary>
public static class SceneSlotViewBuilder
{
    /// <summary>
    /// Every asset a document's candidates propose.
    ///
    /// Deliberately <b>not</b> part of <see cref="SceneViewBuilder.ReferencedAssets"/>, which
    /// is what the writer verifies and resolves facts for on every single edit. A candidate is
    /// a suggestion, not a placement: making the writer verify them would mean an asset
    /// recycled after being proposed blocks every later edit to the scene, including the one
    /// that rejects it. Proposals are verified where they are made instead.
    /// </summary>
    public static IReadOnlyList<SceneAssetRef> CandidateAssets(SceneDocument document) =>
        (document.Slots ?? Array.Empty<SceneSlot>())
            .SelectMany(slot => slot.Candidates)
            .Where(candidate => candidate.Asset is not null)
            .Select(candidate => candidate.Asset!)
            .ToList();

    public static SceneSlotView Describe(
        SceneSlot slot,
        SceneDocument document,
        IReadOnlyDictionary<string, SceneAssetFacts> facts,
        IReadOnlyDictionary<string, SceneAssetProfile> profiles,
        IReadOnlyDictionary<string, SceneCandidateMedia>? media = null,
        SceneProjectConstraints? project = null) => new(
            slot.Id,
            document.Nodes.FirstOrDefault(n => string.Equals(n.SlotId, slot.Id, StringComparison.Ordinal))?.Id,
            slot.Brief,
            slot.Status,
            slot.ChosenCandidateId,
            slot.ResolvedBy,
            slot.ReopenedReason,
            slot.Candidates.Select(c => Describe(slot, c, facts, profiles, media, project)).ToList(),
            slot.RecommendedCandidateId,
            slot.HasAcceptableRecommendation);

    public static SceneSlotCandidateView Describe(
        SceneSlot slot,
        SceneSlotCandidate candidate,
        IReadOnlyDictionary<string, SceneAssetFacts> facts,
        IReadOnlyDictionary<string, SceneAssetProfile> profiles,
        IReadOnlyDictionary<string, SceneCandidateMedia>? media = null,
        SceneProjectConstraints? project = null)
    {
        var reference = Ref(slot.Id, candidate.Id);

        return new SceneSlotCandidateView(
            candidate.Id,
            reference,
            candidate.Label,
            candidate.Asset,
            candidate.Material,
            candidate.Rationale,
            string.Equals(slot.ChosenCandidateId, candidate.Id, StringComparison.Ordinal),
            candidate.IsRejected,
            candidate.RejectedReason,
            DescribeFacts(candidate.Asset, facts, profiles),
            candidate.StoreAsset,
            // A store proposal is not choosable, and the flag is computed here rather than
            // inferred by each reader: the editor, the agent tools and the tests would
            // otherwise each get their own chance to forget the rule.
            Choosable: !candidate.IsFromStore,
            media is not null && media.TryGetValue(reference, out var found) ? found : null,
            DescribeProfileFit(candidate.Asset, profiles, project),
            Recommended: string.Equals(slot.RecommendedCandidateId, candidate.Id, StringComparison.Ordinal));
    }

    public static IReadOnlyList<SceneSlotView> DescribeAll(
        SceneDocument document,
        IReadOnlyDictionary<string, SceneAssetFacts> facts,
        IReadOnlyDictionary<string, SceneAssetProfile> profiles,
        IReadOnlyDictionary<string, SceneCandidateMedia>? media = null,
        SceneProjectConstraints? project = null) =>
        (document.Slots ?? Array.Empty<SceneSlot>())
            .Select(slot => Describe(slot, document, facts, profiles, media, project))
            .ToList();

    /// <summary>How a candidate is addressed in prose and in tool arguments: <c>slot/candidate</c>.</summary>
    public static string Ref(string slotId, string candidateId) => $"{slotId}/{candidateId}";

    /// <summary>
    /// Facts for a proposed asset, or null when nothing is known about it.
    ///
    /// Null is reported rather than a view full of nulls, because the two say different
    /// things: "this asset has never been extracted" is a reason to hesitate before choosing
    /// it, and a card showing empty dashes in every field looks like a rendering bug.
    /// </summary>
    private static SceneCandidateFacts? DescribeFacts(
        SceneAssetRef? asset,
        IReadOnlyDictionary<string, SceneAssetFacts> facts,
        IReadOnlyDictionary<string, SceneAssetProfile> profiles)
    {
        if (asset is null)
        {
            return null;
        }

        var key = SceneSpatial.FactsKey(asset);
        facts.TryGetValue(key, out var fact);
        profiles.TryGetValue(key, out var profile);

        if (fact is null && profile is null)
        {
            return null;
        }

        return new SceneCandidateFacts(
            profile?.Name,
            fact?.WorldDimensions,
            profile is null ? null : profile.PartCount,
            profile?.MaterialCount,
            profile?.Flags is { Count: > 0 } flags ? flags : null,
            profile?.Cameras.Count ?? 0,
            profile?.Lights.Count ?? 0);
    }

    /// <summary>
    /// The candidate measured against its scene's project (prompt 13-D5).
    /// </summary>
    /// <remarks>
    /// Derived from the same profile the validator reads, rather than parsed out of the
    /// agent's rationale. 05's cards already show real numbers; the numbers are what let a user
    /// overrule a plausible-sounding wrong answer - but only once something says what they are
    /// being measured against.
    ///
    /// <para>
    /// The off-style test is the validator's: an asset is only called out when it declares a
    /// style the project's styles rule out. An asset nobody has described says nothing, and
    /// silence is not evidence against it.
    /// </para>
    /// </remarks>
    private static SceneCandidateProfileFit? DescribeProfileFit(
        SceneAssetRef? asset,
        IReadOnlyDictionary<string, SceneAssetProfile> profiles,
        SceneProjectConstraints? project)
    {
        if (asset is null || project is null)
        {
            return null;
        }

        profiles.TryGetValue(SceneSpatial.FactsKey(asset), out var profile);

        var triangles = profile?.TriangleCount;
        var budget = project.MaxTrianglesPerAsset;
        var within = budget is int cap && triangles is int tris ? tris <= cap : (bool?)null;

        var declared = profile?.DeclaredStyles ?? Array.Empty<string>();
        var matches = declared.Any(s => project.ProjectStyles.Contains(s, StringComparer.OrdinalIgnoreCase));
        var contradicts = declared
            .Where(s => project.OffStyleTokens.Contains(s, StringComparer.OrdinalIgnoreCase))
            .ToList();

        return new SceneCandidateProfileFit(
            project.ProjectName,
            triangles,
            budget,
            within,
            matches,
            contradicts,
            SummarizeFit(project, triangles, budget, within, matches, contradicts, declared));
    }

    private static string SummarizeFit(
        SceneProjectConstraints project,
        int? triangles,
        int? budget,
        bool? within,
        bool matches,
        IReadOnlyList<string> contradicts,
        IReadOnlyList<string> declared)
    {
        var parts = new List<string>();

        // Invariant formatting, like every other agent-facing number here: a card that reads
        // "5 000" on one machine and "5,000" on another is a card whose wording depends on
        // where the server happens to run.
        parts.Add(triangles is int tris
            ? FormattableString.Invariant($"{tris:N0} triangles")
            : "triangle count unknown");

        parts.Add(budget switch
        {
            null => $"{project.ProjectName} sets no per-asset budget",
            int cap when within == true => FormattableString.Invariant($"inside the {cap:N0} budget"),
            int cap when within == false => FormattableString.Invariant($"over the {cap:N0} budget"),
            int cap => FormattableString.Invariant($"nothing to compare against the {cap:N0} budget"),
        });

        if (contradicts.Count > 0)
        {
            parts.Add($"described as {string.Join(", ", contradicts)}, which {project.ProjectName}'s style rules out");
        }
        else if (matches)
        {
            parts.Add($"matches {string.Join(", ", project.ProjectStyles)}");
        }
        else if (declared.Count > 0)
        {
            parts.Add($"described as {string.Join(", ", declared)}");
        }
        else if (project.ProjectStyles.Count > 0)
        {
            // Said out loud rather than left blank: an empty style line reads as "checked and
            // fine", and on this library almost nothing has been described yet.
            parts.Add("nothing says what style it is");
        }

        return string.Join("; ", parts) + ".";
    }
}
