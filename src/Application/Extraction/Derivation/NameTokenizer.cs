using System.Text.RegularExpressions;

namespace Application.Extraction.Derivation;

/// <summary>
/// Turns a hand-authored object/asset name into normalised search tokens. These
/// tokens are weighted above every other text field in search (prompt 24) because
/// authored names are the strongest semantic signal available without a model.
///
/// Steps: strip a known prefix → split on separators and camelCase boundaries →
/// drop pure-numeric tokens and duplicate markers (<c>Object.001</c>) → lowercase
/// → dedupe (order preserved).
/// </summary>
public static partial class NameTokenizer
{
    // Exporter/default names that carry no semantic identity. Used to decide when a
    // part is "unnamed" (the Object.001…Object.247 degenerate case), not to filter
    // tokens out of search.
    private static readonly HashSet<string> GenericNames = new(StringComparer.OrdinalIgnoreCase)
    {
        "object", "mesh", "group", "node", "empty", "cube", "sphere", "cylinder",
        "plane", "cone", "torus", "default", "polysurface", "untitled", "model",
        "new", "unnamed", "geometry", "geo", "shape", "primitive", "null",
    };

    [GeneratedRegex(@"([a-z0-9])([A-Z])")]
    private static partial Regex CamelBoundary();

    [GeneratedRegex(@"([A-Z]+)([A-Z][a-z])")]
    private static partial Regex AcronymBoundary();

    [GeneratedRegex(@"[_\-.\s/\\]+")]
    private static partial Regex Separators();

    /// <summary>Normalised, deduped tokens for a name (empty when the name yields nothing).</summary>
    public static IReadOnlyList<string> Tokenize(string? name, DerivationOptions? options = null)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            return Array.Empty<string>();
        }

        var working = name.Trim();

        // Strip the first matching known prefix (e.g. "SM_Door" → "Door").
        if (options?.StripPrefixes is { Length: > 0 })
        {
            foreach (var prefix in options.StripPrefixes)
            {
                if (!string.IsNullOrEmpty(prefix) &&
                    working.StartsWith(prefix, StringComparison.OrdinalIgnoreCase) &&
                    working.Length > prefix.Length)
                {
                    working = working[prefix.Length..];
                    break;
                }
            }
        }

        // Insert boundaries at camelCase / acronym transitions, then split on separators.
        working = CamelBoundary().Replace(working, "$1 $2");
        working = AcronymBoundary().Replace(working, "$1 $2");

        var tokens = new List<string>();
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var raw in Separators().Split(working))
        {
            var token = raw.Trim().ToLowerInvariant();
            if (token.Length == 0)
            {
                continue;
            }
            // Drop pure-numeric tokens and duplicate markers (001, 02, 247).
            if (token.All(char.IsDigit))
            {
                continue;
            }
            if (seen.Add(token))
            {
                tokens.Add(token);
            }
        }

        return tokens;
    }

    /// <summary>True when at least one token is a real authored word (not an exporter default).</summary>
    public static bool HasMeaningfulTokens(IEnumerable<string> tokens) =>
        tokens.Any(t => !GenericNames.Contains(t));
}
