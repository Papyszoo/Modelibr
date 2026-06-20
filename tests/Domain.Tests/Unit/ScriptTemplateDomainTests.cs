using Domain.Models;
using Xunit;

namespace Domain.Tests.Unit;

public class ScriptTemplateDomainTests
{
    [Fact]
    public void Create_NormalizesLanguage_TrimsName_AndDescription()
    {
        var template = ScriptTemplate.Create(
            "  MonoBehaviour  ", "CSharp", "class X {}", DateTime.UtcNow, "  A note  ");

        Assert.Equal("MonoBehaviour", template.Name);
        Assert.Equal("csharp", template.Language);
        Assert.Equal("class X {}", template.Content);
        Assert.Equal("A note", template.Description);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Create_WithBlankName_Throws(string name)
    {
        Assert.Throws<ArgumentException>(() =>
            ScriptTemplate.Create(name, "csharp", "", DateTime.UtcNow));
    }

    [Fact]
    public void Create_WithBlankLanguage_Throws()
    {
        Assert.Throws<ArgumentException>(() =>
            ScriptTemplate.Create("name", "  ", "", DateTime.UtcNow));
    }

    [Fact]
    public void Update_ReplacesFields_AndBumpsTimestamp()
    {
        var template = ScriptTemplate.Create("name", "lua", "old", DateTime.UtcNow);
        var updatedAt = DateTime.UtcNow.AddMinutes(5);

        template.Update("renamed", "python", "new content", updatedAt, "desc");

        Assert.Equal("renamed", template.Name);
        Assert.Equal("python", template.Language);
        Assert.Equal("new content", template.Content);
        Assert.Equal("desc", template.Description);
        Assert.Equal(updatedAt, template.UpdatedAt);
    }
}
