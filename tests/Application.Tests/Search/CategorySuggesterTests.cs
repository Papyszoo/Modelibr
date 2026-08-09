using Application.Search;
using Xunit;

namespace Application.Tests.Search;

public class CategorySuggesterTests
{
    [Theory]
    [InlineData("sword", "weapon")]
    [InlineData("longsword", "weapon")]      // substring match
    [InlineData("wolf", "animal")]
    [InlineData("house", "building")]
    [InlineData("spaceship", "vehicle")]
    [InlineData("chair", "furniture")]
    [InlineData("boulder", "nature")]
    public void Suggest_Maps_ConcreteToken_To_ConceptLabel(string token, string expectedLabel)
    {
        // The retrieval test's core miss: a "weapon"/"animal"/"building" query returned
        // nothing because no authored token equals the concept word. This bridges them.
        var labels = CategorySuggester.Suggest(new[] { token });
        Assert.Contains(expectedLabel, labels);
    }

    [Fact]
    public void Suggest_Returns_Empty_When_No_Keyword_Matches()
    {
        var labels = CategorySuggester.Suggest(new[] { "asdfqwer", "node001" });
        Assert.Empty(labels);
    }

    [Fact]
    public void Suggest_Returns_Multiple_Distinct_Labels_Ordered()
    {
        var labels = CategorySuggester.Suggest(new[] { "sword", "wolf", "sword" });
        Assert.Equal(new[] { "animal", "weapon" }, labels); // SortedSet ordinal order, deduped
    }

    [Fact]
    public void Suggest_Ignores_Null_And_Blank_Tokens()
    {
        Assert.Empty(CategorySuggester.Suggest(null));
        Assert.Empty(CategorySuggester.Suggest(new[] { "", "  " }));
    }
}
