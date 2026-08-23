using Application.Extraction.Derivation;

namespace Application.Search;

/// <summary>
/// Reads the free taxonomy an import already carries and nothing recorded: the folder the
/// file sat in, and the names of the files that sat next to it.
///
/// <para>
/// The folder is a real signal on every large library. POLYGON City ships
/// <c>SourceFiles/Characters/…</c>; the base-mesh packs give each asset its own directory
/// under a kind. An asset in a folder of <c>SM_Veh_*</c> is a vehicle even when its own
/// name is <c>SM_Veh_Wheel_03</c>, and the folder is the only place that says so.
/// </para>
///
/// <para>
/// It is a <b>weak</b> signal by construction: it describes the group, not this asset. Both
/// consumers treat it that way - search scores folder tokens in their own tier below an
/// authored name, and the import automation only ever suggests from them.
/// </para>
/// </summary>
public static class ImportFolderSignal
{
    /// <summary>
    /// Path segments that name a container, a file format, or a pipeline stage rather than a
    /// kind of asset. Dropped before anything else looks at the path, because
    /// <c>Downloads/Assets/FBX/Chair</c> should contribute "chair" and nothing else.
    /// </summary>
    private static readonly HashSet<string> NoiseSegments = new(StringComparer.OrdinalIgnoreCase)
    {
        // containers
        "assets", "asset", "models", "model", "meshes", "mesh", "content", "contents",
        "files", "file", "data", "library", "lib", "resources", "resource", "packs",
        "pack", "collection", "collections", "bundle", "bundles",
        // pipeline stages
        "source", "sources", "sourcefiles", "src", "export", "exports", "exported",
        "import", "imports", "imported", "output", "outputs", "build", "builds",
        "raw", "final", "finals", "wip", "work", "working", "temp", "tmp", "new", "old",
        "backup", "backups", "archive", "archives", "test", "tests", "sample", "samples",
        // formats
        "fbx", "obj", "gltf", "glb", "blend", "blender", "dae", "stl", "ply", "usd",
        "usdz", "3ds", "max", "maya", "c4d", "abc",
        // engines
        "unity", "unreal", "ue4", "ue5", "godot", "godot4", "project", "projects",
    };

    /// <summary>
    /// Segments that mean "everything above here describes the machine, not the asset".
    /// Reaching one <b>stops</b> the climb rather than skipping a level, because the folder
    /// above a user's Downloads is their username - which is not taxonomy, and is the one
    /// thing that would otherwise end up as a tag on their whole library.
    /// </summary>
    private static readonly HashSet<string> RootSegments = new(StringComparer.OrdinalIgnoreCase)
    {
        "users", "user", "home", "desktop", "documents", "downloads", "dropbox",
        "onedrive", "icloud", "volumes", "mnt", "media", "var", "opt", "srv", "tmp",
    };

    /// <summary>
    /// How many folder levels are read, counted from the file upwards. Three covers
    /// <c>Pack/Kind/AssetName</c> without letting a deep checkout's top-level directories -
    /// which say where the disk is organised, not what the asset is - into the signal.
    /// </summary>
    private const int MaxDepth = 3;

    /// <summary>The shortest segment worth keeping. Two-letter directories are shorthand, not taxonomy.</summary>
    private const int MinSegmentLength = 3;

    /// <summary>
    /// The meaningful folder segments, <b>deepest first</b>, capped at <see cref="MaxDepth"/>.
    /// Deepest first because the directory immediately containing a file is the one that
    /// describes it most closely.
    /// </summary>
    public static IReadOnlyList<string> Segments(string? folder)
    {
        if (string.IsNullOrWhiteSpace(folder))
        {
            return Array.Empty<string>();
        }

        var parts = folder
            .Replace('\\', '/')
            .Split('/', StringSplitOptions.RemoveEmptyEntries)
            .Select(p => p.Trim())
            .Where(p => p.Length > 0)
            .ToList();

        var kept = new List<string>(MaxDepth);
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        for (var i = parts.Count - 1; i >= 0 && kept.Count < MaxDepth; i--)
        {
            var segment = parts[i].Trim(' ', '.');
            // Everything from here up is where the disk is organised. Stop, don't skip.
            if (RootSegments.Contains(segment)) break;
            if (segment.Length < MinSegmentLength) continue;
            // A drive letter, a UNC host, or a version directory says nothing about content.
            if (segment.All(char.IsDigit)) continue;
            if (segment.Contains(':')) continue;
            if (NoiseSegments.Contains(segment)) continue;
            if (seen.Add(segment))
            {
                kept.Add(segment);
            }
        }

        return kept;
    }

    /// <summary>
    /// Index tokens for the folder: every kept segment tokenised the way an authored name is,
    /// then widened for abbreviations and compounds so <c>SM_Veh</c> reaches "vehicle".
    /// Empty when the path carried nothing but containers.
    /// </summary>
    public static IReadOnlyList<string> Tokens(string? folder)
    {
        var segments = Segments(folder);
        if (segments.Count == 0)
        {
            return Array.Empty<string>();
        }

        var tokens = segments.SelectMany(s => NameTokenizer.Tokenize(s)).ToList();
        return tokens.Count == 0 ? Array.Empty<string>() : SearchVocabulary.ExpandForIndex(tokens);
    }

    /// <summary>
    /// The tags a folder is worth turning into, in the authored spelling the directory used -
    /// <c>Characters</c> stays "Characters", not "character". Capped at two: the two
    /// innermost folders are the ones that describe the asset; anything above them describes
    /// the pack.
    /// </summary>
    public static IReadOnlyList<string> TagCandidates(string? folder)
        => Segments(folder).Take(2).ToList();

    /// <summary>
    /// Tokens shared by the names of the files sitting next to this one, excluding the file
    /// itself. A folder of <c>SM_Veh_Car_01</c>, <c>SM_Veh_Truck_02</c>,
    /// <c>SM_Veh_Wheel_03</c> yields <c>sm, veh</c> - which is what makes the wheel a vehicle
    /// part rather than an unclassifiable noun.
    /// </summary>
    /// <param name="siblingNames">
    /// File names (with or without extension) of everything importable in the same folder,
    /// including this asset's own file - it is excluded by <paramref name="ownName"/>.
    /// </param>
    /// <remarks>
    /// Requires at least <see cref="MinSiblingsForShared"/> other files. Two files sharing a
    /// prefix is a coincidence; several sharing one is a naming convention.
    /// </remarks>
    public static IReadOnlyList<string> SharedSiblingTokens(
        IEnumerable<string>? siblingNames,
        string? ownName)
    {
        if (siblingNames is null)
        {
            return Array.Empty<string>();
        }

        var others = siblingNames
            .Where(n => !string.IsNullOrWhiteSpace(n))
            .Select(n => n.Trim())
            .Where(n => ownName is null || !string.Equals(
                System.IO.Path.GetFileNameWithoutExtension(n),
                System.IO.Path.GetFileNameWithoutExtension(ownName),
                StringComparison.OrdinalIgnoreCase))
            .Select(n => NameTokenizer.Tokenize(System.IO.Path.GetFileNameWithoutExtension(n)))
            .Where(t => t.Count > 0)
            .ToList();

        if (others.Count < MinSiblingsForShared)
        {
            return Array.Empty<string>();
        }

        // The tokens EVERY sibling carries. Intersection rather than "most" on purpose: a
        // token one file in five happens to share is noise, and this feeds tagging.
        var shared = new HashSet<string>(others[0], StringComparer.OrdinalIgnoreCase);
        foreach (var tokens in others.Skip(1))
        {
            shared.IntersectWith(tokens);
            if (shared.Count == 0) break;
        }

        if (shared.Count == 0)
        {
            return Array.Empty<string>();
        }

        // Preserve the first sibling's token order so the result is stable, not hash-ordered.
        var ordered = others[0].Where(shared.Contains).ToList();
        return SearchVocabulary.ExpandForIndex(ordered);
    }

    private const int MinSiblingsForShared = 3;

    /// <summary>
    /// Which of a folder's image files belong to this model, so a path import can carry its
    /// textures instead of arriving untextured.
    /// </summary>
    /// <param name="modelFileName">The model file being imported, with extension.</param>
    /// <param name="imageFileNames">Every image in the folder (and any texture subfolder), by relative path.</param>
    /// <param name="modelFileCount">How many importable model files the folder holds, including this one.</param>
    /// <remarks>
    /// <para>
    /// Two layouts, two rules. A folder holding <b>one</b> model is that model's folder, so
    /// every image in it is its - this is how the glTF sample assets and the base-mesh packs
    /// are laid out. A folder holding <b>many</b> models shares its textures between them, so
    /// only images whose name shares a word with the model's are taken.
    /// </para>
    /// <para>
    /// The second rule is the one that matters. POLYGON City ships 696 FBX files beside a
    /// common texture directory; taking every image for every model would be 139,000
    /// auxiliary rows, and taking none is what left the pack untextured.
    /// </para>
    /// </remarks>
    public static IReadOnlyList<string> SelectTextureSiblings(
        string? modelFileName,
        IEnumerable<string>? imageFileNames,
        int modelFileCount)
    {
        if (string.IsNullOrWhiteSpace(modelFileName) || imageFileNames is null)
        {
            return Array.Empty<string>();
        }

        var candidates = imageFileNames
            .Where(n => !string.IsNullOrWhiteSpace(n))
            .Select(n => n.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        if (candidates.Count == 0)
        {
            return Array.Empty<string>();
        }

        if (modelFileCount <= 1)
        {
            return candidates.Take(MaxTextureSiblings).ToList();
        }

        var stemTokens = new HashSet<string>(
            NameTokenizer.Tokenize(System.IO.Path.GetFileNameWithoutExtension(modelFileName)),
            StringComparer.OrdinalIgnoreCase);
        if (stemTokens.Count == 0)
        {
            return Array.Empty<string>();
        }

        return candidates
            .Where(n => NameTokenizer
                .Tokenize(System.IO.Path.GetFileNameWithoutExtension(n))
                .Any(stemTokens.Contains))
            .Take(MaxTextureSiblings)
            .ToList();
    }

    /// <summary>
    /// The ceiling on how many images one import drags in. A PBR set is four to six maps and
    /// a variant-heavy asset a few dozen; past that the folder is a shared texture library,
    /// not this asset's material.
    /// </summary>
    private const int MaxTextureSiblings = 32;
}
