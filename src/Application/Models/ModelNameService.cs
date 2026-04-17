using System.Text.RegularExpressions;
using Application.Abstractions.Repositories;
using Application.Settings;
using SharedKernel;

namespace Application.Models;

/// <summary>
/// Centralized service for resolving model name collisions based on the configured duplicate name policy.
/// </summary>
internal static partial class ModelNameService
{
    /// <summary>
    /// Resolves the final model name based on the duplicate name policy.
    /// Returns the original or auto-renamed name on success, or a failure if the name is rejected.
    /// </summary>
    public static async Task<Result<string>> ResolveNameAsync(
        string requestedName,
        IModelRepository modelRepository,
        ISettingRepository settingRepository,
        CancellationToken cancellationToken)
    {
        var exists = await modelRepository.ExistsByNameAsync(requestedName, cancellationToken);
        if (!exists)
            return Result.Success(requestedName);

        var policy = await GetPolicyAsync(settingRepository, cancellationToken);

        if (policy == "Reject")
        {
            return Result.Failure<string>(
                new Error("ModelNameAlreadyExists", $"A model with the name '{requestedName}' already exists."));
        }

        // AutoRename: generate next available name
        var baseName = GetBaseName(requestedName);
        var existingNames = await modelRepository.GetNamesByPrefixAsync(baseName, cancellationToken);
        var uniqueName = GenerateUniqueName(baseName, existingNames);

        return Result.Success(uniqueName);
    }

    /// <summary>
    /// Gets the configured duplicate name policy. Defaults to "Reject" if not set.
    /// </summary>
    internal static async Task<string> GetPolicyAsync(
        ISettingRepository settingRepository,
        CancellationToken cancellationToken)
    {
        var setting = await settingRepository.GetByKeyAsync(SettingKeys.ModelDuplicateNamePolicy, cancellationToken);
        return setting?.Value is "AutoRename" ? "AutoRename" : "Reject";
    }

    /// <summary>
    /// Extracts the base name from a potentially suffixed name.
    /// "Chair (3)" → "Chair", "Chair" → "Chair", "Chair (2) (3)" → "Chair (2)"
    /// </summary>
    internal static string GetBaseName(string name)
    {
        var match = DuplicateSuffixRegex().Match(name);
        return match.Success ? match.Groups[1].Value : name;
    }

    /// <summary>
    /// Generates the next available unique name using Windows-style duplicate naming.
    /// </summary>
    internal static string GenerateUniqueName(string baseName, IReadOnlyList<string> existingNames)
    {
        var nameSet = new HashSet<string>(existingNames, StringComparer.Ordinal);

        // Start from 2 (Windows convention: "Chair", "Chair (2)", "Chair (3)")
        for (int i = 2; i <= 10000; i++)
        {
            var candidate = $"{baseName} ({i})";
            if (!nameSet.Contains(candidate))
                return candidate;
        }

        // Extremely unlikely fallback
        return $"{baseName} ({Guid.NewGuid().ToString("N")[..8]})";
    }

    [GeneratedRegex(@"^(.+?)\s+\(\d+\)$")]
    private static partial Regex DuplicateSuffixRegex();
}
