namespace Application.Extraction.Jobs;

/// <summary>
/// Extraction-queue families (see <see cref="Domain.Models.ExtractionJob.ExtractorFamily"/>).
/// Distinct families let large-geometry work be scheduled separately from cheap indexing.
/// </summary>
public static class ExtractorFamilies
{
    /// <summary>Model scene-graph (re-)extraction — load the file, walk the graph, rebuild parts/derivation/search.</summary>
    public const string Geometry = "Geometry";
}
