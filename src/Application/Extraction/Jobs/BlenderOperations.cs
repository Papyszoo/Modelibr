namespace Application.Extraction.Jobs;

/// <summary>
/// The operations the Blender family knows how to run
/// (see <see cref="Domain.Models.ExtractionJob.Operation"/>).
/// </summary>
/// <remarks>
/// Named here rather than in the worker because the queue has to reject an operation it
/// cannot run at the moment it is asked for. A job accepted for an unknown operation would
/// be claimed, refused by the worker, retried twice and dead-lettered - four minutes to
/// deliver a typo's error message that this constant list answers immediately.
/// </remarks>
public static class BlenderOperations
{
    /// <summary>Generate a UV layout for a model version, written as a new version.</summary>
    public const string UvUnwrap = "uv-unwrap";

    /// <summary>Bake surface detail into texture maps, imported as a texture set.</summary>
    public const string BakeTextures = "bake-textures";

    /// <summary>Convert a model version to another file format, written as a new version.</summary>
    public const string ConvertFormat = "convert-format";

    /// <summary>Measure geometry Blender can answer about and nothing else can.</summary>
    public const string MeshAnalysis = "mesh-analysis";

    public static readonly IReadOnlyList<string> All =
        [UvUnwrap, BakeTextures, ConvertFormat, MeshAnalysis];

    public static bool IsKnown(string? operation) =>
        operation is not null && All.Contains(operation.Trim(), StringComparer.Ordinal);
}
