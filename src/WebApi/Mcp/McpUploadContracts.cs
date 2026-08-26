using WebApi.Infrastructure;

namespace WebApi.Mcp;

/// <summary>
/// What each asset family's HTTP upload endpoint is called, what it calls its parts, and a
/// line showing a correct call.
///
/// One table, read by both tools that hand it out - <c>import_model</c>'s remote branch and
/// <c>request_upload_ticket</c>. They used to describe the same endpoints separately, and
/// they had already drifted: <c>import_model</c> named the multi-file and zip routes with a
/// worked example, while <c>request_upload_ticket</c> offered <c>POST /models</c> alone. An
/// agent that asked for a ticket to upload a loose <c>.gltf</c> was told the single-file
/// contract and given no reason to think another existed.
///
/// Worked examples are the point. The obvious reading of "POST /models/multifile (loose
/// .gltf + external .bin)" is "post the files", which 400s - the real contract pairs each
/// file with the URI it is referenced by. An agent gets one guess before it burns a turn, so
/// every entry here names the fix rather than only the shape.
/// </summary>
internal static class McpUploadContracts
{
    /// <summary>One family's default upload route.</summary>
    internal sealed record UploadTarget(
        string AssetType,
        string Operation,
        string Endpoint,
        object Fields,
        string Example,
        string? CommonMistake = null);

    /// <summary>
    /// Where each family's bytes go. Returned to the agent verbatim: the failure this
    /// prevents is an agent guessing a field name, getting a 400, and burning a turn per
    /// guess.
    /// </summary>
    public static readonly IReadOnlyDictionary<string, UploadTarget> Targets =
        new Dictionary<string, UploadTarget>(StringComparer.OrdinalIgnoreCase)
        {
            [AgentAssetFamilies.Model] = new(
                AgentAssetFamilies.Model, "import-model", "POST /models",
                new { file = "the model file (required)" },
                "file=chair.glb",
                "Using this route for a loose .gltf that references external files - see alternatives below, or the import lands with no geometry."),

            [AgentAssetFamilies.Sound] = new(
                AgentAssetFamilies.Sound, "import-sound", "POST /sounds/with-file",
                new { file = "the audio file (required)", name = "optional; defaults to the file name", categoryId = "optional", packId = "optional" },
                "file=door_creak.wav; name=Door creak"),

            [AgentAssetFamilies.Sprite] = new(
                AgentAssetFamilies.Sprite, "import-sprite", "POST /sprites/with-file",
                new { file = "the image file (required)", name = "optional", spriteType = "Static, SpriteSheet, Gif or Apng", categoryId = "optional", packId = "optional" },
                "file=explosion_sheet.png; spriteType=SpriteSheet",
                "Sending an animation strip as Static - it imports as one flat image and no frames are derived."),

            [AgentAssetFamilies.EnvironmentMap] = new(
                AgentAssetFamilies.EnvironmentMap, "import-environment-map", "POST /environment-maps/with-file",
                new { file = "the HDRI / equirectangular image (required)", name = "optional", sizeLabel = "optional, e.g. '4k'", packId = "optional" },
                "file=sunset_4k.hdr; name=Sunset; sizeLabel=4k"),

            [AgentAssetFamilies.TextureSet] = new(
                AgentAssetFamilies.TextureSet, "import-texture-set", "POST /texture-sets/with-file",
                new { file = "the first channel's image (required)", name = "the material name (required)", textureType = "Albedo, Normal, Roughness...", kind = "ModelSpecific or Universal" },
                "file=oak_albedo.png; name=Oak; textureType=Albedo; kind=Universal",
                "Posting every channel at once - this route creates the set from ONE channel; ask for another ticket with textureSetId for each of the rest."),
        };

    /// <summary>
    /// Adding a channel to a texture set that already exists. A different operation against
    /// the same family: without it a remote agent could upload a material's first channel and
    /// nothing else, so a four-map material was un-importable from anywhere but the server.
    /// </summary>
    public static UploadTarget AddTextureChannel(int textureSetId) => new(
        AgentAssetFamilies.TextureSet,
        "add-texture-channel",
        $"POST /texture-sets/{textureSetId}/textures/with-file",
        new
        {
            file = "the channel's image (required)",
            textureType = "Albedo, Normal, Roughness, Metallic, AO, Height, Emissive, Opacity, Specular, SplitChannel...",
            sourceChannel = "channel-packed maps only: R, G, B, A or RGB",
        },
        "file=oak_normal.png; textureType=Normal",
        "Reusing the idempotencyKey of the previous channel - the second upload is answered 'already-applied' and the channel never lands.");

    /// <summary>
    /// The two routes a model asset may need instead of <c>POST /models</c>. Handed out
    /// beside the single-file contract rather than only on request, because an agent that
    /// does not know they exist has no reason to ask.
    /// </summary>
    public static object ModelAlternatives => new
    {
        multiFile = new
        {
            endpoint = "POST /models/multifile",
            contentType = "multipart/form-data",
            whenToUse = "a loose .gltf that references external .bin/texture files",
            fields = new
            {
                primary = "the .gltf itself (required)",
                files = "each referenced file, repeated once per file (required)",
                paths = "the URI each files[i] is referenced BY, relative to the primary - same order, same count as files[]",
            },
            example = "primary=scene.gltf; files=scene.bin, files=textures/wood.png; paths=scene.bin, paths=textures/wood.png",
            commonMistake = "Posting only the files and omitting paths[] - the server cannot resolve the glTF's URIs and returns 400 MissingPrimary or a broken import.",
        },
        zip = new
        {
            endpoint = "POST /models/zip",
            contentType = "multipart/form-data",
            fields = new { file = "a .zip containing the model and its companions" },
            example = "file=chair_with_textures.zip",
            whenToUse = "simplest correct choice for any multi-file asset - the server unpacks and resolves references itself",
        },
    };

    /// <summary>The upload block a tool hands back, in one shape both of them use.</summary>
    public static object Describe(UploadTarget target) => new
    {
        endpoint = target.Endpoint,
        contentType = "multipart/form-data",
        fields = target.Fields,
        example = target.Example,
        commonMistake = target.CommonMistake,
    };
}
