namespace Application.Search;

/// <summary>
/// Deterministic, local-first vocabulary used to widen an asset's indexed tokens and to
/// normalise a query's words. Three mechanisms, all static and auditable - no inference:
///
/// <list type="bullet">
/// <item><b>Abbreviations</b> - game libraries are full of them. Synty ships
/// <c>SM_Bld_Apartment_01</c>, which tokenises to <c>bld, apartment</c>; without
/// expansion <c>bld</c> is a meaningless token and the asset is invisible to the word
/// "building" while a <c>door</c> is not.</item>
/// <item><b>Compounds</b> - adjacent tokens joined (<c>lamp</c> + <c>post</c> →
/// <c>lamppost</c>) so multi-word concepts survive the tokenizer's separator split.</item>
/// <item><b>Synonyms</b> - an asset named <c>lamp_post</c> should answer the query
/// <c>streetlight</c>. Groups are expanded at index time so the query side stays a plain
/// literal match (and stays explainable).</item>
/// </list>
/// </summary>
public static class SearchVocabulary
{
    /// <summary>Abbreviation → full word. Applied per token at index and query time.</summary>
    private static readonly IReadOnlyDictionary<string, string> Abbreviations =
        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["bld"] = "building",
            ["bldg"] = "building",
            ["blg"] = "building",
            ["veh"] = "vehicle",
            ["vhcl"] = "vehicle",
            ["env"] = "environment",
            ["envi"] = "environment",
            ["chr"] = "character",
            ["char"] = "character",
            ["wpn"] = "weapon",
            ["furn"] = "furniture",
            ["dec"] = "decoration",
            ["decor"] = "decoration",
            ["bg"] = "background",
            ["fx"] = "effect",
            ["vfx"] = "effect",
            ["lgt"] = "light",
            ["tex"] = "texture",
            ["mat"] = "material",
            ["anim"] = "animation",
            ["veg"] = "vegetation",
            ["struct"] = "structure",
        };

    /// <summary>
    /// Synonym groups. If an asset carries any member (as a token or a compound), every
    /// member is added to its indexed tokens.
    /// </summary>
    private static readonly string[][] SynonymGroups =
    {
        new[] { "streetlight", "lamppost", "streetlamp" },
        new[] { "sofa", "couch", "settee" },
        new[] { "trashcan", "garbagecan", "dustbin", "wastebin" },
        new[] { "car", "automobile" },
        new[] { "truck", "lorry" },
        new[] { "sidewalk", "pavement" },
        new[] { "elevator", "lift" },
        new[] { "flashlight", "torch" },
        new[] { "cupboard", "cabinet" },
        new[] { "sign", "signage" },
        new[] { "rubbish", "trash", "garbage" },
        new[] { "apartment", "flat" },
        new[] { "shop", "store" },
    };

    private static readonly Dictionary<string, string[]> SynonymLookup = BuildSynonymLookup();

    private static Dictionary<string, string[]> BuildSynonymLookup()
    {
        var map = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase);
        foreach (var group in SynonymGroups)
        {
            foreach (var member in group)
            {
                map[member] = group;
            }
        }
        return map;
    }

    /// <summary>
    /// Expands authored tokens into the full indexable set: the originals, plus
    /// abbreviation expansions, adjacent-token compounds, and synonym-group members.
    /// Order-stable and deduped, so a re-derive of unchanged input yields an identical
    /// document.
    /// </summary>
    public static IReadOnlyList<string> ExpandForIndex(IReadOnlyList<string>? tokens)
    {
        if (tokens is null || tokens.Count == 0)
        {
            return Array.Empty<string>();
        }

        var result = new List<string>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        void Add(string value)
        {
            if (!string.IsNullOrWhiteSpace(value) && seen.Add(value))
            {
                result.Add(value);
            }
        }

        foreach (var token in tokens)
        {
            Add(token);
            if (Abbreviations.TryGetValue(token, out var expanded))
            {
                Add(expanded);
            }
        }

        // Adjacent-pair compounds: "lamp" + "post" -> "lamppost".
        for (var i = 0; i + 1 < tokens.Count; i++)
        {
            Add(tokens[i] + tokens[i + 1]);
        }

        // Synonyms, over everything produced so far (so a compound can trigger a group).
        foreach (var value in result.ToList())
        {
            if (SynonymLookup.TryGetValue(value, out var group))
            {
                foreach (var member in group)
                {
                    Add(member);
                }
            }
        }

        return result;
    }

    /// <summary>Abbreviation expansion for a single query word, or the word unchanged.</summary>
    public static string ExpandWord(string word) =>
        Abbreviations.TryGetValue(word, out var expanded) ? expanded : word;

    /// <summary>
    /// Crude English singularisation, enough to stop plural queries losing results
    /// (<c>chairs</c> → <c>chair</c>, <c>boxes</c> → <c>box</c>, <c>bodies</c> →
    /// <c>body</c>). Returns the input unchanged when no rule applies. Deliberately not a
    /// stemmer: identifiers must not be mangled.
    /// </summary>
    public static string Singularize(string word)
    {
        if (word.Length < 4)
        {
            return word;
        }
        if (word.EndsWith("ies", StringComparison.OrdinalIgnoreCase) && word.Length > 4)
        {
            return string.Concat(word.AsSpan(0, word.Length - 3), "y");
        }
        if (word.EndsWith("sses", StringComparison.OrdinalIgnoreCase) ||
            word.EndsWith("shes", StringComparison.OrdinalIgnoreCase) ||
            word.EndsWith("ches", StringComparison.OrdinalIgnoreCase) ||
            word.EndsWith("xes", StringComparison.OrdinalIgnoreCase) ||
            word.EndsWith("zes", StringComparison.OrdinalIgnoreCase))
        {
            return word[..^2];
        }
        if (word.EndsWith("s", StringComparison.OrdinalIgnoreCase) &&
            !word.EndsWith("ss", StringComparison.OrdinalIgnoreCase) &&
            !word.EndsWith("us", StringComparison.OrdinalIgnoreCase))
        {
            return word[..^1];
        }
        return word;
    }
}
