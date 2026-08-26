using Application.Search;
using Xunit;

namespace Application.Tests.Search;

/// <summary>
/// The concept map decides whether an intent query like "vehicle" finds anything, so it
/// is pinned from both directions: the concepts an asset MUST get, and - the half that
/// actually regressed on a real library - the concepts it must NOT get.
///
/// Every anti-hit here is a wrong answer observed against a 1,700-model library while
/// matching was a substring test: "credit_card" was a vehicle because "card" contains
/// "car", "roman_pottery" a character because "roman" contains "man", "bowl" a weapon
/// because it contains "bow", and "clamp" furniture because it contains "lamp".
/// </summary>
public class CategorySuggesterTests
{
    private static IReadOnlyList<string> SuggestFor(params string[] tokens) =>
        CategorySuggester.Suggest(SearchVocabulary.ExpandForIndex(tokens));

    [Theory]
    // The concrete → concept mappings an agent depends on.
    [InlineData("vehicle", "car", "tire")]
    [InlineData("vehicle", "veh", "car", "van")]
    [InlineData("vehicle", "ambulance")]
    [InlineData("building", "bld", "apartment")]
    [InlineData("building", "bld", "shop")]
    [InlineData("building", "skyscraper")]
    [InlineData("building", "warehouse")]
    [InlineData("character", "sk", "character", "female", "coat")]
    [InlineData("character", "pedestrian")]
    [InlineData("weapon", "axe")]
    [InlineData("weapon", "longsword")]
    [InlineData("furniture", "office", "chair")]
    [InlineData("furniture", "bookcase")]
    [InlineData("nature", "pine", "tree")]
    [InlineData("food", "apple")]
    [InlineData("environment", "lamp", "post")]
    [InlineData("environment", "prop", "traffic", "light")]
    public void Suggest_Assigns_Expected_Concept(string expected, params string[] tokens)
    {
        Assert.Contains(expected, SuggestFor(tokens));
    }

    [Theory]
    // Regression: substring matching produced every one of these on real assets.
    [InlineData("vehicle", "credit", "card")]     // "card" contains "car"
    [InlineData("character", "roman", "pottery")] // "roman" contains "man"
    [InlineData("weapon", "bowl")]                // "bowl" contains "bow"
    [InlineData("furniture", "clamp")]            // "clamp" contains "lamp"
    [InlineData("weapon", "medieval", "bookcase")]
    [InlineData("vehicle", "cartwheel")]
    [InlineData("animal", "ratchet")]             // "ratchet" contains "rat"
    [InlineData("food", "bottle", "cap")]         // a bottle cap is not food
    public void Suggest_Does_Not_Assign_Wrong_Concept(string forbidden, params string[] tokens)
    {
        Assert.DoesNotContain(forbidden, SuggestFor(tokens));
    }

    [Fact]
    public void Suggest_Treats_Building_Parts_As_Environment_Not_Buildings()
    {
        // Someone asking for a "building" wants buildings, not the 200 doors that belong
        // to them - doors used to fill every slot of the "building" result page.
        var door = SuggestFor("door");
        Assert.DoesNotContain("building", door);
        Assert.Contains("environment", door);
    }

    [Fact]
    public void Suggest_Is_Deterministic_And_Alphabetical()
    {
        var first = SuggestFor("apartment", "door", "car");
        var second = SuggestFor("apartment", "door", "car");
        Assert.Equal(first, second);
        Assert.Equal(first.OrderBy(x => x, StringComparer.Ordinal), first);
    }

    [Fact]
    public void Suggest_Handles_Plural_Authored_Names()
    {
        Assert.Contains("prop", SuggestFor("barrels"));
        Assert.Contains("furniture", SuggestFor("chairs"));
    }

    [Fact]
    public void Suggest_Returns_Empty_For_No_Tokens()
    {
        Assert.Empty(CategorySuggester.Suggest(null));
        Assert.Empty(CategorySuggester.Suggest(Array.Empty<string>()));
    }

    [Fact]
    public void SuggestBest_Prefers_The_Sharper_Claim_Over_The_Catch_All()
    {
        // A sword rack matches both. Alphabetical order - which is right for a list - would
        // have picked "furniture", and the whole point of a single choice is that the
        // sharper of the two is the one worth acting on.
        Assert.Equal("weapon", CategorySuggester.SuggestBest(new[] { "sword", "rack", "shelf" }));
        Assert.Equal("vehicle", CategorySuggester.SuggestBest(new[] { "car", "crate" }));
    }

    [Fact]
    public void SuggestBest_Is_Null_When_Nothing_Matched()
    {
        Assert.Null(CategorySuggester.SuggestBest(new[] { "xyzzy" }));
        Assert.Null(CategorySuggester.SuggestBest(null));
    }
}
