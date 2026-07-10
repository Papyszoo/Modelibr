using System.Text.RegularExpressions;

namespace Infrastructure.WebDav;

/// <summary>
/// Utility methods shared across WebDAV components. Public because
/// <c>WebApi.Infrastructure.WebDavMiddleware</c> (a different assembly) also resolves
/// model paths through the same id-suffix disambiguation contract for Blender Safe Save.
/// </summary>
public static partial class WebDavUtilities
{
    /// <summary>
    /// Extracts the file extension from a filename.
    /// </summary>
    /// <param name="fileName">The filename to extract the extension from</param>
    /// <returns>The extension without the leading dot, or empty string if no extension</returns>
    public static string GetExtension(string fileName)
    {
        var dotIndex = fileName.LastIndexOf('.');
        return dotIndex >= 0 ? fileName[(dotIndex + 1)..] : "";
    }

    /// <summary>
    /// Builds a virtual filename from an asset's Name and the extension of its stored file.
    /// Used so that WebDAV listings reflect the unique asset name rather than the original upload filename.
    /// </summary>
    public static string GetVirtualFileName(string assetName, string originalFileName)
    {
        var ext = GetExtension(originalFileName);
        return string.IsNullOrEmpty(ext) ? assetName : $"{assetName}.{ext}";
    }

    // --- Duplicate-name disambiguation (WebDAV addresses assets by name, but asset
    // names are no longer globally unique now that the "Allow" duplicate-name policy
    // is available). Convention: a name stays plain while it is unique among
    // non-deleted siblings of the same asset type in a given listing; the moment two
    // or more siblings collide (case-insensitively), ALL of them render with an
    // "{name} [{id}]" suffix (id = the asset's DB id, stable forever). See the
    // webdav-patterns skill / prompt for the full contract.

    /// <summary>
    /// Parses a WebDAV path segment for a trailing " [id]" disambiguation suffix in the
    /// shared "{name} [{id}]" convention. For flat files the suffix sits directly before
    /// the file extension (e.g. "Footstep [17].wav"); for folders there is no extension
    /// (e.g. "Chair [42]"). <paramref name="baseName"/> is the segment with just the
    /// " [id]" marker removed — i.e. the plain, non-disambiguated form of the segment
    /// (extension, if any, stays attached) — so callers can compare it against a
    /// candidate's ordinary (pre-disambiguation) display name.
    /// </summary>
    public static bool TryParseIdSuffix(string segment, out string baseName, out int id)
    {
        baseName = segment;
        id = 0;

        var match = IdSuffixRegex().Match(segment);
        if (!match.Success || !int.TryParse(match.Groups["id"].Value, out id))
        {
            id = 0;
            return false;
        }

        baseName = match.Groups["name"].Value + match.Groups["ext"].Value;
        return true;
    }

    [GeneratedRegex(@"^(?<name>.+) \[(?<id>\d+)\](?<ext>\.[^.\[\]\s]+)?$")]
    private static partial Regex IdSuffixRegex();

    /// <summary>
    /// Computes each candidate's WebDAV display NAME (asset name only — no file
    /// extension) for a listing, appending the shared "[id]" suffix to every entry
    /// whose name collides case-insensitively with another candidate in the same
    /// listing. For flat files, wrap the result with <see cref="GetVirtualFileName"/>
    /// to attach the extension AFTER disambiguating, so the id suffix lands before the
    /// extension per the shared convention. Collision scope is exactly the candidates
    /// passed in — callers must pre-scope siblings to a single listing/asset-type
    /// (e.g. one project's models, not all models globally).
    /// </summary>
    public static IReadOnlyDictionary<int, string> ComputeDisplayNames<T>(
        IEnumerable<T> candidates,
        Func<T, int> idSelector,
        Func<T, string> nameSelector)
    {
        var result = new Dictionary<int, string>();

        foreach (var group in candidates.GroupBy(nameSelector, StringComparer.OrdinalIgnoreCase))
        {
            var members = group.ToList();
            var collides = members.Count > 1;

            foreach (var item in members)
            {
                var id = idSelector(item);
                var name = nameSelector(item);
                result[id] = collides ? FormatWithIdSuffix(name, id) : name;
            }
        }

        return result;
    }

    /// <summary>
    /// Formats the shared disambiguation suffix: exactly "{name} [{id}]".
    /// </summary>
    public static string FormatWithIdSuffix(string name, int id) => $"{name} [{id}]";

    /// <summary>
    /// Resolves a WebDAV path segment against a sibling set using the shared
    /// disambiguation contract:
    ///  1. If the segment parses as "{base} [{id}]" (see <see cref="TryParseIdSuffix"/>)
    ///     and a candidate with that id exists whose plain display name equals
    ///     {base} case-insensitively, resolve to it.
    ///  2. Otherwise, treat the whole segment as a plain name matched
    ///     case-insensitively against candidates' plain display names. Exactly one
    ///     match resolves; zero or multiple matches return null — never guess among
    ///     duplicates (the client gets a 404).
    /// <paramref name="nameSelector"/> must return each candidate's plain
    /// (non-disambiguated) display name — i.e. the name/virtual-filename it would have
    /// if it were the only sibling in the listing (matching what
    /// <see cref="ComputeDisplayNames{T}"/> would show for a non-colliding entry).
    /// </summary>
    public static T? ResolveSegment<T>(
        string segment,
        IEnumerable<T> candidates,
        Func<T, int> idSelector,
        Func<T, string> nameSelector)
        where T : class
    {
        var candidateList = candidates as IReadOnlyCollection<T> ?? candidates.ToList();

        if (TryParseIdSuffix(segment, out var baseName, out var id))
        {
            var byId = candidateList.FirstOrDefault(c =>
                idSelector(c) == id && string.Equals(nameSelector(c), baseName, StringComparison.OrdinalIgnoreCase));
            if (byId != null)
                return byId;
        }

        var matches = candidateList
            .Where(c => string.Equals(nameSelector(c), segment, StringComparison.OrdinalIgnoreCase))
            .ToList();

        return matches.Count == 1 ? matches[0] : null;
    }
}
