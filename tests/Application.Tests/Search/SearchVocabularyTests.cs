using Application.Search;
using Xunit;

namespace Application.Tests.Search;

/// <summary>
/// Token widening is what makes a real game library searchable by ordinary words. The
/// motivating case: Synty's <c>SM_Bld_Apartment_01</c> tokenises to <c>bld, apartment</c>,
/// so before expansion the library's 334 buildings were unreachable by the word
/// "building" while its doors were not.
/// </summary>
public class SearchVocabularyTests
{
    [Fact]
    public void ExpandForIndex_Expands_Abbreviations()
    {
        var expanded = SearchVocabulary.ExpandForIndex(new[] { "bld", "apartment" });
        Assert.Contains("building", expanded);
        Assert.Contains("bld", expanded);       // the original is kept - exact search still works
        Assert.Contains("apartment", expanded);
    }

    [Fact]
    public void ExpandForIndex_Joins_Adjacent_Tokens_Into_Compounds()
    {
        // "lamp_post" must answer "lamppost" (and, through synonyms, "streetlight").
        var expanded = SearchVocabulary.ExpandForIndex(new[] { "lamp", "post" });
        Assert.Contains("lamppost", expanded);
    }

    [Fact]
    public void ExpandForIndex_Adds_Synonym_Group_Members()
    {
        var expanded = SearchVocabulary.ExpandForIndex(new[] { "lamp", "post" });
        Assert.Contains("streetlight", expanded);

        var sofa = SearchVocabulary.ExpandForIndex(new[] { "sofa" });
        Assert.Contains("couch", sofa);
    }

    /// <summary>
    /// The interior vocabulary, from the queries that came back empty against the real
    /// library while the object itself was sitting in it under another name.
    /// </summary>
    [Theory]
    [InlineData("carpet", "rug")]
    [InlineData("rug", "carpet")]
    [InlineData("bookcase", "bookshelf")]
    [InlineData("shelf", "bookshelf")]
    [InlineData("television", "tv")]
    [InlineData("tv", "television")]
    [InlineData("dresser", "sideboard")]
    [InlineData("closet", "wardrobe")]
    [InlineData("pillow", "cushion")]
    [InlineData("fridge", "refrigerator")]
    public void ExpandForIndex_Reaches_The_Other_Word_For_The_Same_Object(string authored, string queried)
    {
        Assert.Contains(queried, SearchVocabulary.ExpandForIndex(new[] { authored }));
    }

    [Fact]
    public void ExpandForIndex_Reaches_A_Synonym_Through_A_Compound()
    {
        // "bedside_table" tokenises to bedside + table; the compound is what carries it to
        // "nightstand", which is the word a scene brief is far more likely to use.
        var expanded = SearchVocabulary.ExpandForIndex(new[] { "bedside", "table" });
        Assert.Contains("nightstand", expanded);
    }

    [Fact]
    public void ExpandForIndex_Is_Order_Stable_And_Deduped()
    {
        var a = SearchVocabulary.ExpandForIndex(new[] { "bld", "apartment", "bld" });
        var b = SearchVocabulary.ExpandForIndex(new[] { "bld", "apartment", "bld" });
        Assert.Equal(a, b);                              // a re-derive must not churn the document
        Assert.Equal(a.Count, a.Distinct().Count());
    }

    [Fact]
    public void ExpandForIndex_Handles_Empty_Input()
    {
        Assert.Empty(SearchVocabulary.ExpandForIndex(null));
        Assert.Empty(SearchVocabulary.ExpandForIndex(Array.Empty<string>()));
    }

    [Theory]
    [InlineData("chairs", "chair")]
    [InlineData("boxes", "box")]
    [InlineData("bodies", "body")]
    [InlineData("benches", "bench")]
    [InlineData("glass", "glass")]   // -ss is not a plural
    [InlineData("cactus", "cactus")] // -us is not a plural
    [InlineData("bus", "bus")]       // too short to strip
    public void Singularize_Handles_Plurals_Without_Mangling_Identifiers(string input, string expected)
    {
        Assert.Equal(expected, SearchVocabulary.Singularize(input));
    }
}
