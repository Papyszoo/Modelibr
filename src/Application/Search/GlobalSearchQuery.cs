using Application.Abstractions.Messaging;

namespace Application.Search;

/// <summary>
/// Cross-asset search over names and (where supported) tags. Returns hits
/// grouped by asset type, each group capped at <see cref="PerTypeLimit"/>.
/// </summary>
public record GlobalSearchQuery(string Term, int PerTypeLimit = 8)
    : IQuery<GlobalSearchResponse>;

public record GlobalSearchResponse(IReadOnlyList<SearchResultGroup> Groups);

public record SearchResultGroup(
    string Type,
    int TotalCount,
    IReadOnlyList<SearchResultItem> Items);

public record SearchResultItem(
    string Type,
    int Id,
    string Name,
    string MatchedOn);
