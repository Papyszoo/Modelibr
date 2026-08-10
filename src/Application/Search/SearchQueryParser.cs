namespace Application.Search;

/// <summary>
/// Splits a free-text query into scorable words.
///
/// The search used to pass the whole raw phrase to every clause: token/name matching
/// required the phrase to appear contiguously, and the only clause that could match words
/// in any order was trigram similarity against the entire concatenated token blob. That
/// made multi-word queries a lottery — <c>traffic light</c> happened to land, while
/// <c>streetlight for a city street</c> returned an arm bone — and it is why adding words
/// could *raise* the result count instead of narrowing it.
///
/// Now each word is scored independently and a document that matches more of them ranks
/// higher (see <c>SearchRepository</c>). Stopwords are dropped so prose briefs behave like
/// keyword queries.
/// </summary>
public static class SearchQueryParser
{
    /// <summary>Words scored per query. Beyond this, extra words are ignored rather than
    /// widening the query further — a brief's first words carry its intent.</summary>
    public const int MaxTerms = 6;

    private static readonly HashSet<string> StopWords = new(StringComparer.OrdinalIgnoreCase)
    {
        "a", "an", "and", "the", "of", "for", "with", "without", "in", "on", "at", "to",
        "from", "by", "or", "but", "some", "any", "that", "this", "these", "those", "it",
        "its", "as", "is", "are", "be", "into", "onto", "than", "then", "very", "me",
        "my", "i", "need", "want", "find", "give", "show", "looking", "something",
    };

    private static readonly char[] Separators =
        { ' ', '\t', '\n', '\r', ',', ';', ':', '"', '\'', '(', ')', '[', ']', '{', '}', '!', '?' };

    /// <summary>One query word and the literal forms a document may carry it as.</summary>
    /// <param name="Word">The normalised word (lowercase, abbreviation-expanded).</param>
    /// <param name="Variants">Forms to match against indexed tokens — the word itself plus
    /// its singular, so <c>chairs</c> finds <c>chair</c>.</param>
    public sealed record QueryTerm(string Word, IReadOnlyList<string> Variants);

    /// <summary>
    /// Parsed query. <see cref="Terms"/> is empty for a blank query, which callers treat as
    /// "match everything" so structural filters can be used on their own.
    /// </summary>
    public sealed record ParsedQuery(string Original, IReadOnlyList<QueryTerm> Terms)
    {
        public bool IsEmpty => Terms.Count == 0;

        /// <summary>True when the query is a single word — the only case where fuzzy
        /// (trigram) matching is allowed to introduce results on its own.</summary>
        public bool IsSingleTerm => Terms.Count == 1;
    }

    public static ParsedQuery Parse(string? query)
    {
        var original = query?.Trim() ?? string.Empty;
        if (original.Length == 0)
        {
            return new ParsedQuery(string.Empty, Array.Empty<QueryTerm>());
        }

        var rawWords = original
            .Split(Separators, StringSplitOptions.RemoveEmptyEntries)
            .Select(w => w.Trim().ToLowerInvariant())
            .Where(w => w.Length > 0)
            .ToList();

        var kept = rawWords.Where(w => !StopWords.Contains(w)).ToList();
        // A query made entirely of stopwords still deserves an attempt at its literal words.
        if (kept.Count == 0)
        {
            kept = rawWords;
        }

        var terms = new List<QueryTerm>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var word in kept)
        {
            if (terms.Count == MaxTerms)
            {
                break;
            }

            var normalized = SearchVocabulary.ExpandWord(word);
            if (!seen.Add(normalized))
            {
                continue;
            }

            var variants = new List<string> { normalized };
            var singular = SearchVocabulary.Singularize(normalized);
            if (!string.Equals(singular, normalized, StringComparison.OrdinalIgnoreCase))
            {
                variants.Add(singular);
            }

            terms.Add(new QueryTerm(normalized, variants));
        }

        return new ParsedQuery(original, terms);
    }
}
