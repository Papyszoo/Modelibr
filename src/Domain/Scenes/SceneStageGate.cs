namespace Domain.Scenes;

/// <summary>
/// What stops a scene claiming it is further along than its own geometry says.
///
/// The stages would be a comment if nothing enforced them. The run this comes from spent four
/// lighting attempts and three floor swaps on a scene in which every object was floating half
/// its height - the appearance work was not wrong, it was premature, and all of it had to be
/// redone once the composition moved. So advancing the stage is the point at which the server
/// asks whether the composition holds, and refuses if it does not.
///
/// <b>Contact blocks; containment is carried.</b> That is a deliberate narrowing of "contact
/// or containment", and the reason is whether the caller has a way to answer. Every contact
/// finding is answerable in the document itself - <c>groundSnap</c>, <c>on</c>, or
/// <c>suspended</c> for something meant to hang - so the gate is a question with three
/// answers rather than a wall. Nothing in the document can declare "this is meant to sit below
/// the floor", so blocking on <c>Containment.BelowFloor</c> would leave a sunken bath or a
/// foundation with no way past, and a gate that cannot be answered is a gate that gets worked
/// around. Containment findings ride back on the response instead, said once, at the moment
/// the caller commits to the stage.
///
/// Note what this implies about severity: the finding this exists to catch,
/// <c>Contact.Unsupported</c>, is a <i>warning</i>. Blocking on errors alone would have made
/// the gate dead code, because <see cref="SceneSpatial.ResolvePlacements"/> runs on every write
/// and repairs every contact error before one can be stored. The undeclared floater is the one
/// that survives, and it is the one that shipped the broken living room.
///
/// There is deliberately no force flag. <c>suspended</c> is the escape, and it is a durable
/// fact about the node rather than a way past one call.
/// </summary>
public static class SceneStageGate
{
    /// <summary>
    /// Whether a finding refuses a stage advance. Info never does - <c>Contact.Unverifiable</c>
    /// means the contact could not be measured, which is a gap in the evidence and not a fault
    /// in the scene.
    /// </summary>
    public static bool Blocks(SceneFinding finding) =>
        finding.Check == SceneChecks.Contact &&
        finding.Severity is SceneFindingSeverities.Error or SceneFindingSeverities.Warning;

    /// <summary>
    /// Findings that refuse this write, and findings it carries forward.
    ///
    /// Both are empty when the write is not a stage advance: an ordinary placement into a
    /// half-built scene is not the moment to demand the scene be finished.
    /// </summary>
    public static (IReadOnlyList<SceneFinding> Blocking, IReadOnlyList<SceneFinding> Carried) Check(
        SceneDocument current,
        SceneDocument candidate,
        IReadOnlyDictionary<string, SceneAssetFacts> facts)
    {
        if (!SceneStages.IsAdvance(current.Stage, candidate.Stage))
        {
            return (Array.Empty<SceneFinding>(), Array.Empty<SceneFinding>());
        }

        // Judged on the candidate, not on what is stored: a single write that both fixes the
        // composition and advances the stage is exactly the write this should let through.
        // Profiles are not resolved, and are not needed - contact and containment are pure
        // geometry, so the gate costs a write no extra lookups.
        var findings = SceneValidator.Validate(candidate, facts).Findings;

        return (
            findings.Where(Blocks).ToList(),
            findings
                .Where(f => f.Check == SceneChecks.Containment && f.Severity != SceneFindingSeverities.Info)
                .ToList());
    }
}
