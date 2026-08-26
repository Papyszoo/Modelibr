namespace Application.Extraction.Jobs;

/// <summary>
/// Extraction-queue families (see <see cref="Domain.Models.ExtractionJob.ExtractorFamily"/>).
/// Distinct families let large-geometry work be scheduled separately from cheap indexing.
/// </summary>
public static class ExtractorFamilies
{
    /// <summary>Model scene-graph (re-)extraction - load the file, walk the graph, rebuild parts/derivation/search.</summary>
    public const string Geometry = "Geometry";

    /// <summary>
    /// Work that runs Blender: unwrapping, baking, converting, analysing.
    /// </summary>
    /// <remarks>
    /// Its own family because of what it costs. A bake is minutes of CPU and gigabytes of
    /// memory, where a re-derive is seconds; sharing the Geometry family would let one
    /// bake queue starve every re-extraction behind it. The worker polls the two
    /// separately and gives this one a much smaller concurrency budget.
    /// </remarks>
    public const string Blender = "Blender";
}
