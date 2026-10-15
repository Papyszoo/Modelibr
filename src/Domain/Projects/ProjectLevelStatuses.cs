namespace Domain.Projects;

/// <summary>The fixed production states a project level may be in.</summary>
public static class ProjectLevelStatuses
{
    public const string Planned = "planned";
    public const string InProgress = "in_progress";
    public const string Review = "review";
    public const string Blocked = "blocked";
    public const string Done = "done";

    public static IReadOnlyList<string> All { get; } =
        [Planned, InProgress, Review, Blocked, Done];

    public static bool IsStatus(string? status) =>
        status is not null && All.Contains(status, StringComparer.Ordinal);

    public static string Normalize(string status)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(status);

        var normalized = status.Trim().ToLowerInvariant();
        return IsStatus(normalized)
            ? normalized
            : throw new ArgumentException(
                $"Production status must be one of: {string.Join(", ", All)}.",
                nameof(status));
    }
}
