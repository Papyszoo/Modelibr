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
public sealed record SceneDocument(
    int SchemaVersion,
    IReadOnlyList<SceneNode> Nodes,
    IReadOnlyList<SceneLight> Lights,
    SceneEnvironment? Environment = null)
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
    bool Visible = true);

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

/// <summary>Binds a texture set (02's <c>bind_texture_set</c> target) to one node.</summary>
public sealed record SceneMaterialBinding(int? TextureSetId = null, string? Variant = null);

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
