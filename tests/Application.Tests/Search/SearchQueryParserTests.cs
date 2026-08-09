using Application.Search;
using Xunit;

namespace Application.Tests.Search;

/// <summary>
/// The parser is what turned multi-word queries from a lottery into something scorable.
/// These pin the behaviour the ranking depends on: words are split, stopwords dropped,
/// plurals carry a singular variant, abbreviations expand, and a blank query is a
/// legitimate "match everything" rather than an error.
/// </summary>
public class SearchQueryParserTests
{
    [Fact]
    public void Parse_Splits_A_Phrase_Into_Words()
    {
        var parsed = SearchQueryParser.Parse("traffic light");
        Assert.Equal(new[] { "traffic", "light" }, parsed.Terms.Select(t => t.Word));
        Assert.False(parsed.IsSingleTerm);
    }

    [Fact]
    public void Parse_Drops_Stopwords_So_A_Prose_Brief_Behaves_Like_Keywords()
    {
        // Regression: "a rundown city street at night" returned nothing, because the
        // whole phrase — stopwords included — had to match.
        var parsed = SearchQueryParser.Parse("a rundown city street at night");
        Assert.Equal(new[] { "rundown", "city", "street", "night" }, parsed.Terms.Select(t => t.Word));
    }

    [Fact]
    public void Parse_Keeps_Literal_Words_When_The_Query_Is_All_Stopwords()
    {
        var parsed = SearchQueryParser.Parse("the a of");
        Assert.NotEmpty(parsed.Terms);
    }

    [Theory]
    [InlineData("chairs", "chair")]
    [InlineData("boxes", "box")]
    [InlineData("buildings", "building")]
    [InlineData("bodies", "body")]
    public void Parse_Adds_A_Singular_Variant_So_Plurals_Do_Not_Lose_Results(string plural, string singular)
    {
        var parsed = SearchQueryParser.Parse(plural);
        Assert.Contains(singular, parsed.Terms[0].Variants);
    }

    [Theory]
    [InlineData("glass")]  // not a plural
    [InlineData("bus")]    // too short to strip safely
    [InlineData("cactus")]
    public void Parse_Does_Not_Mangle_Words_That_Only_Look_Plural(string word)
    {
        var parsed = SearchQueryParser.Parse(word);
        Assert.Equal(word, parsed.Terms[0].Word);
        Assert.All(parsed.Terms[0].Variants, v => Assert.Equal(word, v));
    }

    [Theory]
    [InlineData("bld", "building")]
    [InlineData("veh", "vehicle")]
    [InlineData("env", "environment")]
    public void Parse_Expands_Abbreviations(string abbreviation, string expanded)
    {
        Assert.Equal(expanded, SearchQueryParser.Parse(abbreviation).Terms[0].Word);
    }

    [Fact]
    public void Parse_Treats_A_Blank_Query_As_Match_Everything()
    {
        Assert.True(SearchQueryParser.Parse(null).IsEmpty);
        Assert.True(SearchQueryParser.Parse("   ").IsEmpty);
    }

    [Fact]
    public void Parse_Caps_The_Word_Count()
    {
        var parsed = SearchQueryParser.Parse("one two three four five six seven eight nine");
        Assert.Equal(SearchQueryParser.MaxTerms, parsed.Terms.Count);
    }

    [Fact]
    public void Parse_Dedupes_Repeated_Words()
    {
        var parsed = SearchQueryParser.Parse("car car car");
        Assert.Single(parsed.Terms);
    }

    [Fact]
    public void Parse_Strips_Punctuation()
    {
        var parsed = SearchQueryParser.Parse("low-poly, car (mobile)");
        Assert.Contains("car", parsed.Terms.Select(t => t.Word));
        Assert.DoesNotContain(parsed.Terms, t => t.Word.Contains('(') || t.Word.Contains(','));
    }
}
