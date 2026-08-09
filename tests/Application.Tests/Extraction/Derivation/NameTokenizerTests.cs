using Application.Extraction.Derivation;
using Xunit;

namespace Application.Tests.Extraction.Derivation;

public class NameTokenizerTests
{
    private readonly DerivationOptions _options = new();

    [Fact]
    public void Tokenize_SplitsCamelCase()
    {
        Assert.Equal(new[] { "door", "knob", "brass" }, NameTokenizer.Tokenize("DoorKnobBrass", _options));
    }

    [Fact]
    public void Tokenize_SplitsSeparatorsAndLowercases()
    {
        Assert.Equal(new[] { "old", "wooden", "chair" }, NameTokenizer.Tokenize("Old_Wooden-Chair", _options));
    }

    [Fact]
    public void Tokenize_StripsKnownPrefix()
    {
        Assert.Equal(new[] { "door" }, NameTokenizer.Tokenize("SM_Door", _options));
    }

    [Fact]
    public void Tokenize_DropsNumericSuffixesAndDuplicateMarkers()
    {
        Assert.Equal(new[] { "object" }, NameTokenizer.Tokenize("Object.001", _options));
        Assert.Equal(new[] { "wall" }, NameTokenizer.Tokenize("Wall_02", _options));
    }

    [Fact]
    public void Tokenize_HandlesAcronyms()
    {
        Assert.Equal(new[] { "http", "server" }, NameTokenizer.Tokenize("HTTPServer", _options));
    }

    [Fact]
    public void Tokenize_DedupesPreservingOrder()
    {
        Assert.Equal(new[] { "wall", "brick" }, NameTokenizer.Tokenize("wall_brick_wall", _options));
    }

    [Fact]
    public void Tokenize_EmptyOrNull_ReturnsEmpty()
    {
        Assert.Empty(NameTokenizer.Tokenize(null, _options));
        Assert.Empty(NameTokenizer.Tokenize("   ", _options));
        Assert.Empty(NameTokenizer.Tokenize("001", _options));
    }

    [Fact]
    public void HasMeaningfulTokens_FalseForExporterDefaults()
    {
        Assert.False(NameTokenizer.HasMeaningfulTokens(NameTokenizer.Tokenize("Object.001", _options)));
        Assert.False(NameTokenizer.HasMeaningfulTokens(NameTokenizer.Tokenize("Mesh", _options)));
        Assert.False(NameTokenizer.HasMeaningfulTokens(NameTokenizer.Tokenize("Cube.247", _options)));
    }

    [Fact]
    public void HasMeaningfulTokens_TrueForAuthoredNames()
    {
        Assert.True(NameTokenizer.HasMeaningfulTokens(NameTokenizer.Tokenize("Doorknob_Brass", _options)));
        // A generic word plus a real one is still meaningful.
        Assert.True(NameTokenizer.HasMeaningfulTokens(NameTokenizer.Tokenize("Chair_Mesh", _options)));
    }
}
