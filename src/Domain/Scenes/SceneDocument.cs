namespace Domain.Scenes;

/// <summary>
/// The scene document contract - the one definition of what a scene *is*, shared by the
/// backend, the editor and the MCP tools.
///
/// This is deliberately a pure record graph with no JSON, EF or HTTP concerns: parsing
/// lives in <c>Application.Scenes.SceneDocumentCodec</c>, validation in
/// <see cref="SceneDocumentValidator"/>, and the TypeScript the editor and the agent
/// contract against is <b>generated</b> from these types by
/// <c>SceneContractTypeScriptGenerator</c>. Hand-mirroring the shape into a second
/// language is what the generation exists to prevent - three copies of a schema drift,
/// and the one that drifts silently is the one an agent writes through.
/// </summary>
/// <param name="Stage">
/// How far the scene has deliberately been taken, from <see cref="SceneStages"/>.
///
/// Null means the scene is not being authored in stages, and everything is judged at once -
/// which is what every document written before this existed says, and what the editor's own
/// scenes say until someone declares otherwise. Declaring a stage is opting in to being
/// judged against it: earlier stages stop treating missing light and missing material as
/// defects, and no stage stops treating a floating object as one.
/// </param>
/// <param name="Slots">
/// The decisions in this scene that are still the user's to make, each with the candidates
/// an agent proposed for it. Null on every document written before choices existed, and on
/// any scene composed without them - a scene where the agent simply placed what it picked.
/// </param>
public sealed record SceneDocument(
    int SchemaVersion,
    IReadOnlyList<SceneNode> Nodes,
    IReadOnlyList<SceneLight> Lights,
    SceneEnvironment? Environment = null,
    string? Stage = null,
    IReadOnlyList<SceneSlot>? Slots = null,
    // 1-3 sentences of authored, user-facing rationale about the recommended set as a whole -
    // what direction it takes and what it trades away. Deliberately NOT a scratch pad or a
    // deliberation transcript: it is shown to the user verbatim, and its length is bounded by
    // the validator so it cannot become one.
    string? RecommendationSummary = null)
{
    /// <summary>
    /// The only schema version this build reads or writes.
    ///
    /// A document that does not carry it is rejected rather than guessed at. Bumping this
    /// is a deliberate act that comes with an upgrade path for stored documents - see
    /// <c>SceneDocumentCodec</c>, which is where an upgrade would land.
    /// </summary>
    public const int CurrentSchemaVersion = 1;

    /// <summary>An empty scene at the current schema version - what "create scene" starts from.</summary>
    public static SceneDocument Empty() =>
        new(CurrentSchemaVersion, Array.Empty<SceneNode>(), Array.Empty<SceneLight>(), SceneEnvironment.Default);
}

/// <summary>
/// One placed thing in a scene. Exactly one of <see cref="Asset"/> and
/// <see cref="Primitive"/> is set: a node is either a library asset or blockout geometry.
///
/// <see cref="Id"/> is caller-supplied and stable for the life of the node. It is what an
/// agent, the editor's undo stack and 05's choice UI all address a node by - a node
/// identified by array position would be re-pointed by any insertion.
/// </summary>
public sealed record SceneNode(
    string Id,
    SceneTransform Transform,
    SceneAssetRef? Asset = null,
    ScenePrimitive? Primitive = null,
    string? Name = null,
    /// <summary>
    /// The role this node fills in the scene ("street lamp, third one along"), and the link
    /// to the <see cref="SceneSlot"/> of the same id that holds the alternatives proposed
    /// for it.
    ///
    /// <b>Corrects the original intent.</b> This field was written expecting one node per
    /// alternative, grouped by a shared slot id. Choices went the other way: a slot is one
    /// thing in the world with several proposals for what it should be, so the alternatives
    /// live in the slot and <b>at most one node carries any given slot id</b> - the node the
    /// chosen candidate is applied to. Several nodes for one slot would put every rejected
    /// option in the scene at once.
    ///
    /// A node may still carry a slot id with no matching slot: that is a role the agent
    /// named while placing something and never opened for choice.
    /// </summary>
    string? SlotId = null,
    SceneMaterialBinding? Material = null,
    /// <summary>
    /// Per-slot overrides: "the cushions of this sofa", not the whole sofa.
    ///
    /// Layered over <see cref="Material"/> rather than replacing it - the default binding
    /// dresses every slot no entry here names. Kept as a second field so every document
    /// written before slots existed still parses; the codec rejects unknown members, so a
    /// renamed field would have made the stored scenes unreadable.
    /// </summary>
    IReadOnlyList<SceneMaterialBinding>? MaterialSlots = null,
    bool Visible = true,
    /// <summary>
    /// Keep this node's base resting on y=0.
    ///
    /// A property of the node rather than an argument to one write, because "put it on the
    /// floor" is a standing fact about the placement, not a one-off nudge. A later move that
    /// sets a position without restating the flag used to re-centre the node on its origin
    /// and half-bury it, and reported that only as a changed footprint.
    /// </summary>
    bool? GroundSnap = null,
    /// <summary>
    /// Which local axis is this asset's front, from <see cref="SceneFrontAxes"/>. Nothing in
    /// the derived data knows this, so it is what the caller declared when it last asked to
    /// face the node somewhere - recorded so the next "face the TV" does not have to restate it.
    /// </summary>
    string? FrontAxis = null,
    /// <summary>
    /// A world point this node keeps facing, turning about Y.
    ///
    /// Kept rather than baked into the rotation because a living room is "everything faces
    /// the TV": with the point recorded, moving the TV re-aims the furniture instead of
    /// leaving a room full of objects aimed at where it used to be. Setting a rotation by
    /// hand clears it - a caller who states an angle is no longer tracking anything.
    /// </summary>
    Vec3? FaceToward = null,
    SceneAnchor? Anchor = null,
    /// <summary>
    /// This node hangs in the air on purpose - a pendant lamp, a bird, a sign bracketed off a
    /// wall - so nothing is expected to be holding it up.
    ///
    /// The third answer to "what is under this?", beside <see cref="GroundSnap"/> and
    /// <see cref="Anchor"/>. It exists because the alternative is a check that fires on every
    /// hanging light for the life of the scene with no way to answer it, and a check nobody
    /// can answer is a check everybody learns to skip. Declaring it is what lets a scene move
    /// on to a later stage with a lamp still in mid-air.
    ///
    /// Contradicts both of the other two: something resting on the floor or on another node is
    /// not suspended, and the document validator rejects the combination rather than picking one.
    /// </summary>
    bool? Suspended = null);

/// <summary>
/// Rests this node on top of another node, and keeps it there.
///
/// The point is that "the vase is on the coffee table" survives the table moving. Without it
/// every stacked Y is arithmetic the caller does by hand, and swapping the furniture
/// underneath means recomputing and re-issuing every one of them.
/// </summary>
/// <param name="OnNodeId">The node this one rests on. Must name a node in the same document, and anchors may not form a cycle.</param>
/// <param name="Offset">
/// Displacement from the anchor's reference point - the centre of its top face - to this
/// node's own (centre X, base Y, centre Z), in world-axis metres.
///
/// Null means "wherever this node already is": the offset is captured on the next write and
/// stored, so a document never keeps a null one for long. Zero is the centred case.
/// </param>
public sealed record SceneAnchor(string OnNodeId, Vec3? Offset = null);

/// <summary>
/// A reference to a library asset, pinned to a version.
///
/// <see cref="VersionId"/> is required for versioned families. A scene that silently
/// re-points when a model gets a new version is a data-integrity bug: the user's composed
/// scene would change under them because someone re-uploaded a mesh.
/// </summary>
public sealed record SceneAssetRef(string AssetType, int AssetId, int? VersionId = null);

/// <summary>
/// Blockout geometry. A minority case by design - useful for massing, not for building a
/// library scene out of.
///
/// <para>
/// The exception is a room shell. Walls, a floor and a ceiling are the one part of a scene
/// that should never require an asset search: the alternative is stretching a library asset
/// seven times its size and discovering from a screenshot that it was slatted, or asphalt.
/// </para>
/// </summary>
/// <param name="Color">
/// An <c>#rrggbb</c> surface colour. Null draws the neutral blockout grey. A raw colour
/// rather than a material binding on purpose - a wall the agent has to create a Material for
/// first is a wall it will get wrong for two calls instead of none.
/// </param>
public sealed record ScenePrimitive(string Shape, Vec3? Size = null, string? Color = null);

/// <summary>Position in metres, rotation in degrees (XYZ euler), scale as a multiplier.</summary>
public sealed record SceneTransform(Vec3 Position, Vec3 RotationEuler, Vec3 Scale)
{
    public static SceneTransform Identity => new(Vec3.Zero, Vec3.Zero, Vec3.One);
}

public readonly record struct Vec3(double X, double Y, double Z)
{
    public static Vec3 Zero => new(0, 0, 0);
    public static Vec3 One => new(1, 1, 1);

    public bool IsFinite => double.IsFinite(X) && double.IsFinite(Y) && double.IsFinite(Z);
}

/// <summary>
/// Dresses a node, or one material slot of it, for this scene only.
///
/// Exactly one source: a <see cref="MaterialId"/> (a parameters-only material - a colour
/// and a roughness) or a <see cref="TextureSetId"/> (a tiling global material, which needs
/// UVs). Both at once is rejected rather than resolved, because there is no sensible way to
/// pick between two surfaces a caller asked for by name.
///
/// <see cref="Slot"/> names the model's own material slot ("cushions", "frame"). Null means
/// the node's default binding, which dresses every slot no override names - the same
/// layering an engine's material override list uses.
/// </summary>
public sealed record SceneMaterialBinding(
    int? TextureSetId = null,
    string? Variant = null,
    int? MaterialId = null,
    string? Slot = null);

/// <summary>
/// A decision in the scene that the user has not made yet, and the proposals for it.
///
/// The point of the whole model: an agent's choice of asset is not a value it writes into
/// the scene, it is an <b>open question with candidates</b>. A scene built this way records
/// what was considered and who decided, so a user can overrule a plausible-sounding wrong
/// answer instead of discovering it in a render.
///
/// <see cref="Id"/> is the name the user says out loud - <c>streetlight</c>,
/// <c>hero-building</c>, <c>road-surface</c> - and it is also the <see cref="SceneNode.SlotId"/>
/// of the node this slot decides. At most one node carries it.
/// </summary>
/// <param name="Brief">
/// What the agent was looking for ("low-poly, under 3k tris, reads as rundown"). Kept because
/// it is the only record of the intent the candidates were judged against, and the thing a
/// user is really rejecting when none of them fit.
/// </param>
/// <param name="Candidates">
/// Every proposal ever made for this slot, <b>including the rejected ones</b>. Rejections are
/// feedback, not deletions: they are what stops the next round proposing the same asset again,
/// and what lets the UI grey out what was already ruled out instead of silently re-offering it.
/// </param>
/// <param name="RecommendedCandidateId">
/// The candidate the agent currently advises. <b>Advice, not a decision</b>: setting it never
/// changes the node, <paramref name="ChosenCandidateId"/> or <paramref name="ResolvedBy"/>,
/// and the user is free to pick a different one. It survives its candidate being rejected, so
/// a resolved slot can still say whether the human followed the advice or overruled it.
/// </param>
/// <param name="ChosenCandidateId">
/// The candidate whose asset and material the slot's node currently wears, or null while the
/// slot is still open. Never names a rejected candidate - the validator rejects that document
/// rather than deciding which of the two statements is true.
/// </param>
/// <param name="ResolvedBy">
/// Who resolved it, from <see cref="SceneSlotResolvers"/>. This is the guardrail made visible:
/// an agent may auto-resolve a slot when the user asked it to ("just pick sensible ones"), and
/// the scene must never lose track of which decisions a human actually made.
/// </param>
/// <param name="ReopenedReason">
/// Why the last round was thrown out - the user's "none of these, they are all too modern".
/// Read back by the agent through <c>get_slots</c>, which is how a rejection becomes a better
/// next proposal rather than a repeat.
/// </param>
public sealed record SceneSlot(
    string Id,
    IReadOnlyList<SceneSlotCandidate> Candidates,
    string? Brief = null,
    string? ChosenCandidateId = null,
    string? ResolvedBy = null,
    string? ReopenedReason = null,
    string? RecommendedCandidateId = null)
{
    /// <summary>
    /// Where this slot stands, derived rather than stored.
    ///
    /// A stored status is a second statement about the same facts, and the two drift: a
    /// document could say <c>chosen</c> with nothing chosen. The candidates and
    /// <see cref="ChosenCandidateId"/> are the truth, and this reads them.
    /// </summary>
    public string Status =>
        ChosenCandidateId is not null ? SceneSlotStatuses.Chosen
        : Candidates.Count > 0 && Candidates.All(c => c.IsRejected) ? SceneSlotStatuses.Rejected
        : SceneSlotStatuses.Proposed;

    /// <summary>Candidates still on the table - what "choose one of these" actually offers.</summary>
    public IEnumerable<SceneSlotCandidate> Open => Candidates.Where(c => !c.IsRejected);

    public SceneSlotCandidate? Candidate(string? id) =>
        id is null ? null : Candidates.FirstOrDefault(c => string.Equals(c.Id, id, StringComparison.Ordinal));

    /// <summary>The candidate the slot's node is currently wearing, if the slot is resolved.</summary>
    public SceneSlotCandidate? Chosen => Candidate(ChosenCandidateId);

    /// <summary>The candidate the agent currently advises, if any. Advice, never a decision.</summary>
    public SceneSlotCandidate? Recommended => Candidate(RecommendedCandidateId);

    /// <summary>
    /// Whether this recommendation can be accepted as it stands.
    ///
    /// A recommendation survives its candidate being rejected - the pointer stays as history,
    /// so the UI can still say what was advised and what the user did instead - but a rejected
    /// or already-chosen one is not something a bulk accept may act on. Kept here rather than
    /// re-derived by each reader, because "recommended" and "acceptable" being the same test
    /// in three places is how they stop being the same test.
    /// </summary>
    public bool HasAcceptableRecommendation =>
        ChosenCandidateId is null
        && Recommended is { IsRejected: false, IsFromStore: false };
}

/// <summary>
/// One proposal for a slot: what to put there, why, and - once someone says so - why not.
///
/// <see cref="Id"/> is slot-local and short (<c>A</c>, <c>B</c>, <c>C</c>), so the user
/// addresses a proposal as <c>streetlight/B</c> and can say it out loud. <b>Ids are never
/// reused and never renumber.</b> A rejected <c>B</c> stays <c>B</c> for the life of the
/// scene and the next proposal is <c>D</c> - otherwise "I don't like B" would come to mean a
/// different asset between two turns of the same conversation.
/// </summary>
/// <param name="Asset">The asset proposed, pinned to a version like any other scene reference.</param>
/// <param name="Material">An optional dressing that comes with the proposal - a slot may be a choice of surface rather than of object.</param>
/// <param name="Rationale">The agent's one line on why this one. Shown next to the numbers, never instead of them.</param>
/// <param name="Label">Optional human-readable name for the card, when the asset's own name is not the useful thing to read.</param>
/// <param name="RejectedReason">
/// Why this was ruled out. Its presence <b>is</b> the rejection - a separate boolean would be a
/// second way to say the same thing, and a rejection with no reason teaches the agent nothing.
/// </param>
public sealed record SceneSlotCandidate(
    string Id,
    SceneAssetRef? Asset = null,
    SceneMaterialBinding? Material = null,
    string? Rationale = null,
    string? Label = null,
    string? RejectedReason = null,
    SceneStoreAssetRef? StoreAsset = null)
{
    public bool IsRejected => RejectedReason is not null;

    /// <summary>
    /// True when this proposal is something the library does not have yet.
    ///
    /// The distinction is load-bearing rather than cosmetic: a store candidate cannot be
    /// chosen the way a library one can, because choosing it means acquiring it, and
    /// acquisition is the user's call.
    /// </summary>
    public bool IsFromStore => StoreAsset is not null;
}

/// <summary>
/// A proposal for something in the companion Asset Store - an asset this library does not
/// hold yet (v0.6 prompt 15, part B).
///
/// Deliberately NOT a <see cref="SceneAssetRef"/> with a different id space. Store ids are
/// Guids and library ids are ints, and a scene that blurred the two would let a node be
/// placed against an asset that does not exist locally. Nothing here is placeable: a store
/// candidate becomes real only by being imported, at which point the slot gets a normal
/// library candidate.
///
/// The title and thumbnail are copies, on purpose. They are what the card shows, and a card
/// that cannot be drawn without the store being up would make an offline scene unreadable -
/// the store is optional infrastructure everywhere else in this feature and must be here too.
/// </summary>
/// <param name="StoreUrl">Which store this id belongs to. Two stores can both hold a Guid.</param>
/// <param name="StoreAssetId">The store's own asset id.</param>
/// <param name="Title">What to call it on the card, as the store called it.</param>
/// <param name="ThumbnailUrl">An absolute store URL, or null when the store had no picture.</param>
/// <param name="Price">What it costs. 0 is the only value an agent can acquire by itself.</param>
public sealed record SceneStoreAssetRef(
    string StoreUrl,
    string StoreAssetId,
    string? Title = null,
    string? ThumbnailUrl = null,
    decimal? Price = null,
    string? Currency = null);

/// <summary>Where a slot stands. Derived from the slot, never stored on it.</summary>
public static class SceneSlotStatuses
{
    /// <summary>Open: candidates are on the table and nobody has picked one.</summary>
    public const string Proposed = "proposed";

    /// <summary>Resolved: one candidate is chosen and its asset is what the node wears.</summary>
    public const string Chosen = "chosen";

    /// <summary>Every candidate was ruled out and no new ones have been proposed - the agent's turn.</summary>
    public const string Rejected = "rejected";

    public static readonly IReadOnlyList<string> All = new[] { Proposed, Chosen, Rejected };
}

/// <summary>
/// Who resolved a slot.
///
/// Two values rather than none, because "the agent proposes, the user decides" is only a real
/// guarantee while the scene can say which of the two happened.
/// </summary>
public static class SceneSlotResolvers
{
    /// <summary>A person chose it, in the UI.</summary>
    public const string User = "user";

    /// <summary>An agent chose it on the user's standing instruction to pick sensible ones.</summary>
    public const string Agent = "agent";

    public static readonly IReadOnlyList<string> All = new[] { User, Agent };

    public static bool IsResolver(string? value) =>
        value is not null && All.Contains(value, StringComparer.Ordinal);
}

/// <summary>
/// Allocates candidate ids: <c>A</c>, <c>B</c>, … <c>Z</c>, <c>AA</c>, <c>AB</c>, …
///
/// A spreadsheet column sequence, because the ids exist to be spoken. The allocation rule is
/// the important half: the next id is the first in the sequence that <b>no candidate in this
/// slot has ever held</b>, rejected ones included. Numbering from the count would hand a new
/// proposal the id of one the user just turned down.
/// </summary>
public static class SceneSlotIds
{
    /// <summary>How far the sequence may run before a slot is treated as a runaway loop rather than a choice.</summary>
    public const int MaxCandidates = 64;

    /// <summary>The id at <paramref name="index"/> in the sequence, zero-based: 0 is A, 26 is AA.</summary>
    public static string At(int index)
    {
        if (index < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(index));
        }

        var id = string.Empty;
        for (var n = index; ; n = n / 26 - 1)
        {
            id = (char)('A' + n % 26) + id;
            if (n < 26)
            {
                return id;
            }
        }
    }

    /// <summary>
    /// The next <paramref name="count"/> ids no candidate in <paramref name="slot"/> already holds.
    /// </summary>
    public static IReadOnlyList<string> Allocate(SceneSlot? slot, int count)
    {
        var taken = slot is null
            ? new HashSet<string>(StringComparer.Ordinal)
            : slot.Candidates.Select(c => c.Id).ToHashSet(StringComparer.Ordinal);

        var allocated = new List<string>(count);
        for (var index = 0; allocated.Count < count; index++)
        {
            var id = At(index);
            if (taken.Add(id))
            {
                allocated.Add(id);
            }
        }

        return allocated;
    }
}

public sealed record SceneLight(
    string Id,
    string Type,
    Vec3 Position,
    double Intensity = 1.0,
    string Color = "#ffffff",
    Vec3? Target = null,
    string? Name = null);

public sealed record SceneEnvironment(
    SceneAssetRef? EnvironmentMap = null,
    string? Background = null,
    double? ExposureEv = null)
{
    public static SceneEnvironment Default => new();
}

/// <summary>The light types a scene document may contain.</summary>
public static class SceneLightTypes
{
    public const string Ambient = "ambient";
    public const string Directional = "directional";
    public const string Point = "point";
    public const string Spot = "spot";
    public const string Hemisphere = "hemisphere";

    public static readonly IReadOnlyList<string> All =
        new[] { Ambient, Directional, Point, Spot, Hemisphere };
}

/// <summary>
/// The local axes an asset's front may point along.
///
/// Y is deliberately absent: this exists to answer "which way is it facing", which is a
/// question about yaw, and an asset whose front points at the sky has no answer to it.
/// </summary>
public static class SceneFrontAxes
{
    public const string PlusX = "+X";
    public const string MinusX = "-X";
    public const string PlusZ = "+Z";
    public const string MinusZ = "-Z";

    /// <summary>
    /// What a front axis is assumed to be when nobody said. Not a derived fact - an
    /// assumption, and the reason the tools name it in their descriptions rather than
    /// letting a caller discover it by placing a sofa backwards.
    /// </summary>
    public const string Default = PlusZ;

    public static readonly IReadOnlyList<string> All = new[] { PlusX, MinusX, PlusZ, MinusZ };

    /// <summary>The axis as a unit direction in the XZ plane, or null when it is not one of the four.</summary>
    public static (double X, double Z)? Direction(string? axis) => axis switch
    {
        PlusX => (1, 0),
        MinusX => (-1, 0),
        PlusZ => (0, 1),
        MinusZ => (0, -1),
        _ => null,
    };
}

/// <summary>
/// How a node is placed over the anchor it rests on. Not part of the document - it decides
/// the <see cref="SceneAnchor.Offset"/> a write records, and after that the offset is the
/// whole truth.
/// </summary>
public static class SceneAnchorAlignments
{
    /// <summary>Centre it on the anchor's top face.</summary>
    public const string Center = "center";

    /// <summary>Leave it over whatever part of the anchor it is already over, and only rest it on top.</summary>
    public const string Keep = "keep";

    public static readonly IReadOnlyList<string> All = new[] { Center, Keep };
}

/// <summary>
/// How far a scene has been taken: composition first, colour last.
///
/// The order is the whole content of this vocabulary. A run that tuned four lighting setups
/// and swapped three floors while every object in the scene was floating half its height
/// paid for the appearance work twice - once making it, once redoing it after the layout
/// moved. Flat grey is also the better debugging surface: levitation is obvious in an
/// untextured blockout and easy to miss in a lit, textured render.
///
/// So the stages are not a label. <see cref="SceneValidation"/> judges a scene against the
/// stage it claims, and a write that <i>advances</i> the stage is refused while the
/// composition underneath it is broken.
/// </summary>
public static class SceneStages
{
    /// <summary>Room shell and the large forms. Nothing decorative, nothing dressed.</summary>
    public const string Layout = "layout";

    /// <summary>Props, and the things resting on other things.</summary>
    public const string Detail = "detail";

    /// <summary>Lit: there is a key light and the scene has form.</summary>
    public const string Lit = "lit";

    /// <summary>Dressed: colour, finish, materials. The last thing to do, not the first.</summary>
    public const string Dressed = "dressed";

    /// <summary>In order. Position in this list is what "later" means.</summary>
    public static readonly IReadOnlyList<string> All = new[] { Layout, Detail, Lit, Dressed };

    /// <summary>
    /// Where a stage sits in the sequence. An unstaged document answers -1: it is before
    /// every stage, so declaring any stage on it is an advance and is gated like one.
    /// A value outside the vocabulary answers null - the document validator rejects those,
    /// and nothing here should quietly rank one.
    /// </summary>
    public static int? Order(string? stage) => stage switch
    {
        null => -1,
        Layout => 0,
        Detail => 1,
        Lit => 2,
        Dressed => 3,
        _ => null,
    };

    public static bool IsStage(string? stage) => stage is not null && Order(stage) is >= 0;

    /// <summary>
    /// Whether a scene at <paramref name="stage"/> has reached <paramref name="target"/>, and
    /// so should be judged against what that stage requires.
    ///
    /// An unstaged scene has reached everything. It never opted into staged authoring, so
    /// suppressing its findings would be a silent weakening of the checks it gets today.
    /// </summary>
    public static bool HasReached(string? stage, string target) =>
        stage is null || (Order(stage) is { } at && Order(target) is { } required && at >= required);

    /// <summary>True when moving from <paramref name="current"/> to <paramref name="candidate"/> claims more than before.</summary>
    public static bool IsAdvance(string? current, string? candidate) =>
        Order(candidate) is { } to && Order(current) is { } from && to > from;
}

/// <summary>The blockout shapes a scene document may contain.</summary>
public static class ScenePrimitiveShapes
{
    public const string Box = "box";
    public const string Plane = "plane";
    public const string Sphere = "sphere";
    public const string Cylinder = "cylinder";
    public const string Cone = "cone";

    public static readonly IReadOnlyList<string> All =
        new[] { Box, Plane, Sphere, Cylinder, Cone };
}

/// <summary>
/// The asset families a scene node may reference.
///
/// Kept here rather than reused from <c>ExtractionAssetTypes</c> because not every
/// extractable family is placeable: a sound or a script has no transform. Scripts and
/// sounds are deliberately absent.
/// </summary>
public static class SceneAssetTypes
{
    public const string Model = "Model";
    public const string Sprite = "Sprite";
    public const string EnvironmentMap = "EnvironmentMap";

    public static readonly IReadOnlyList<string> All = new[] { Model, Sprite, EnvironmentMap };

    /// <summary>
    /// Families whose assets carry versions, and therefore must be pinned to one.
    /// </summary>
    public static readonly IReadOnlyList<string> Versioned = new[] { Model };

    public static bool IsPlaceable(string? assetType) =>
        assetType is not null && All.Contains(assetType, StringComparer.Ordinal);

    public static bool RequiresVersion(string? assetType) =>
        assetType is not null && Versioned.Contains(assetType, StringComparer.Ordinal);
}
