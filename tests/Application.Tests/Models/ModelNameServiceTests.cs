using Application.Models;
using Xunit;

namespace Application.Tests.Models;

public class ModelNameServiceTests
{
    [Fact]
    public void GetBaseName_WithPlainName_ReturnsSameName()
    {
        Assert.Equal("Chair", ModelNameService.GetBaseName("Chair"));
    }

    [Fact]
    public void GetBaseName_WithSuffix2_ReturnsBaseName()
    {
        Assert.Equal("Chair", ModelNameService.GetBaseName("Chair (2)"));
    }

    [Fact]
    public void GetBaseName_WithSuffix3_ReturnsBaseName()
    {
        Assert.Equal("Chair", ModelNameService.GetBaseName("Chair (3)"));
    }

    [Fact]
    public void GetBaseName_WithNestedSuffix_StripsOuterSuffix()
    {
        Assert.Equal("Chair (2)", ModelNameService.GetBaseName("Chair (2) (3)"));
    }

    [Fact]
    public void GetBaseName_WithNoNumericSuffix_ReturnsSameName()
    {
        Assert.Equal("Chair (abc)", ModelNameService.GetBaseName("Chair (abc)"));
    }

    [Fact]
    public void GenerateUniqueName_WhenNoExistingNames_Returns2()
    {
        var result = ModelNameService.GenerateUniqueName("Chair", new List<string>());
        Assert.Equal("Chair (2)", result);
    }

    [Fact]
    public void GenerateUniqueName_When2Exists_Returns3()
    {
        var existing = new List<string> { "Chair", "Chair (2)" };
        var result = ModelNameService.GenerateUniqueName("Chair", existing);
        Assert.Equal("Chair (3)", result);
    }

    [Fact]
    public void GenerateUniqueName_When2And3Exist_Returns4()
    {
        var existing = new List<string> { "Chair", "Chair (2)", "Chair (3)" };
        var result = ModelNameService.GenerateUniqueName("Chair", existing);
        Assert.Equal("Chair (4)", result);
    }

    [Fact]
    public void GenerateUniqueName_WithGap_ReturnsFirstAvailable()
    {
        var existing = new List<string> { "Chair", "Chair (2)", "Chair (4)" };
        var result = ModelNameService.GenerateUniqueName("Chair", existing);
        Assert.Equal("Chair (3)", result);
    }

    [Fact]
    public void GenerateUniqueName_HandlesNameWithSpaces()
    {
        var existing = new List<string> { "My Chair Model", "My Chair Model (2)" };
        var result = ModelNameService.GenerateUniqueName("My Chair Model", existing);
        Assert.Equal("My Chair Model (3)", result);
    }
}
