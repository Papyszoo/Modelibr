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
public sealed record SceneDocument(
    int SchemaVersion,
    IReadOnlyList<SceneNode> Nodes,
    IReadOnlyList<SceneLight> Lights,
    SceneEnvironment? Environment = null,
    string? Stage = null)
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
    /// Groups this node with the alternatives proposed for the same role ("street lamp,
    /// third one along"). Written here so 05 can hang a choice UI on the slot model
    /// without a second schema; unused until then.
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

/// <summary>Blockout geometry. A minority case by design - useful for massing, not for building a library scene out of.</summary>
public sealed record ScenePrimitive(string Shape, Vec3? Size = null);

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
