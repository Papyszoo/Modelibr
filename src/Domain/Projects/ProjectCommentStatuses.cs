namespace Domain.Projects;

/// <summary>The two states a project comment can be in.</summary>
public static class ProjectCommentStatuses
{
    public const string Open = "open";
    public const string Resolved = "resolved";

    public static IReadOnlyList<string> All { get; } = [Open, Resolved];

    public static string Normalize(string status)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(status);

        var normalized = status.Trim().ToLowerInvariant();
        return All.Contains(normalized, StringComparer.Ordinal)
            ? normalized
            : throw new ArgumentException(
                $"Comment status must be one of: {string.Join(", ", All)}.",
                nameof(status));
    }
}
