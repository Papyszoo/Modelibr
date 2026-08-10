namespace Domain.Models;

/// <summary>
/// A record of one deliberate search: the query, the filters, the results shown in
/// order, and (later) what the user opened. Cheap to write, impossible to
/// reconstruct after the fact, and the only way to answer "did that change improve
/// results". This is the log, not preference elicitation.
/// </summary>
public class SearchLog
{
    public int Id { get; private set; }

    public string Query { get; private set; } = string.Empty;

    /// <summary>Structural filters applied, as JSON (jsonb); null when none.</summary>
    public string? FiltersJson { get; private set; }

    /// <summary>Results shown, in rank order, as JSON (jsonb): [{assetType, assetId, partPath}].</summary>
    public string ResultsJson { get; private set; } = "[]";

    public int ResultCount { get; private set; }

    public DateTime CreatedAt { get; private set; }

    // What the user opened from these results (recorded after the fact).
    public string? OpenedAssetType { get; private set; }
    public int? OpenedAssetId { get; private set; }
    public DateTime? OpenedAt { get; private set; }

    public static SearchLog Create(
        string query,
        string? filtersJson,
        string resultsJson,
        int resultCount,
        DateTime createdAt)
    {
        return new SearchLog
        {
            Query = query ?? string.Empty,
            FiltersJson = string.IsNullOrWhiteSpace(filtersJson) ? null : filtersJson,
            ResultsJson = string.IsNullOrWhiteSpace(resultsJson) ? "[]" : resultsJson,
            ResultCount = resultCount < 0 ? 0 : resultCount,
            CreatedAt = createdAt
        };
    }

    /// <summary>Records which result the user opened (for later preference features).</summary>
    public void RecordOpened(string assetType, int assetId, DateTime openedAt)
    {
        OpenedAssetType = string.IsNullOrWhiteSpace(assetType) ? null : assetType.Trim();
        OpenedAssetId = assetId > 0 ? assetId : null;
        OpenedAt = openedAt;
    }
}
