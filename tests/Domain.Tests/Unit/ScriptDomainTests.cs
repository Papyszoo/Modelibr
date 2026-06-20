using Domain.Models;
using Domain.ValueObjects;
using Xunit;
using DomainFile = Domain.Models.File;

namespace Domain.Tests.Unit;

public class ScriptDomainTests
{
    [Fact]
    public void Create_WithValidValues_SetsMetadataAndNormalizesLanguage()
    {
        // Arrange & Act
        var script = Script.Create("player", CreateScriptFile(), "LUA", lineCount: 42, sizeBytes: 1024, DateTime.UtcNow, categoryId: 7);

        // Assert
        Assert.Equal("player", script.Name);
        Assert.Equal("lua", script.Language); // normalized to lower-case
        Assert.Equal(42, script.LineCount);
        Assert.Equal(1024, script.SizeBytes);
        Assert.Equal(7, script.ScriptCategoryId);
        Assert.False(script.IsDeleted);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Create_WithBlankName_Throws(string name)
    {
        Assert.Throws<ArgumentException>(() =>
            Script.Create(name, CreateScriptFile(), "lua", 1, 1, DateTime.UtcNow));
    }

    [Fact]
    public void Create_WithBlankLanguage_Throws()
    {
        Assert.Throws<ArgumentException>(() =>
            Script.Create("player", CreateScriptFile(), "  ", 1, 1, DateTime.UtcNow));
    }

    [Fact]
    public void Create_TrimsDescription_AndTreatsBlankAsNull()
    {
        var withDescription = Script.Create("player", CreateScriptFile(), "lua", 1, 1, DateTime.UtcNow, description: "  Player movement.  ");
        Assert.Equal("Player movement.", withDescription.Description);

        var blank = Script.Create("enemy", CreateScriptFile(), "lua", 1, 1, DateTime.UtcNow, description: "   ");
        Assert.Null(blank.Description);
    }

    [Fact]
    public void UpdateDescription_SetsAndClears()
    {
        var script = Script.Create("player", CreateScriptFile(), "lua", 1, 1, DateTime.UtcNow);
        var updatedAt = DateTime.UtcNow.AddMinutes(1);

        script.UpdateDescription("Now documented.", updatedAt);
        Assert.Equal("Now documented.", script.Description);
        Assert.Equal(updatedAt, script.UpdatedAt);

        script.UpdateDescription("", updatedAt.AddMinutes(1));
        Assert.Null(script.Description);
    }

    [Fact]
    public void Create_WithOverlongDescription_Throws()
    {
        Assert.Throws<ArgumentException>(() =>
            Script.Create("player", CreateScriptFile(), "lua", 1, 1, DateTime.UtcNow, description: new string('x', 2001)));
    }

    [Fact]
    public void UpdateContent_RePointsFileAndRefreshesMetrics()
    {
        // Arrange
        var script = Script.Create("player", CreateScriptFile(), "lua", lineCount: 5, sizeBytes: 100, DateTime.UtcNow);
        var newFile = CreateScriptFile("c3d4e5f6789012345678901234567890123456789012345678901234a1b2c3d4");
        var updatedAt = DateTime.UtcNow.AddMinutes(1);

        // Act
        script.UpdateContent(newFile, lineCount: 12, sizeBytes: 256, updatedAt);

        // Assert
        Assert.Same(newFile, script.File);
        Assert.Equal(12, script.LineCount);
        Assert.Equal(256, script.SizeBytes);
        Assert.Equal(updatedAt, script.UpdatedAt);
    }

    [Fact]
    public void SoftDelete_ThenRestore_TogglesDeletedState()
    {
        // Arrange
        var script = Script.Create("player", CreateScriptFile(), "lua", 1, 1, DateTime.UtcNow);

        // Act
        script.SoftDelete(DateTime.UtcNow);
        Assert.True(script.IsDeleted);
        Assert.NotNull(script.DeletedAt);

        script.Restore(DateTime.UtcNow);

        // Assert
        Assert.False(script.IsDeleted);
        Assert.Null(script.DeletedAt);
    }

    private static DomainFile CreateScriptFile(string hash = "a1b2c3d4567890123456789012345678901234567890123456789012c3d4e5f6")
    {
        return DomainFile.Create(
            "player.lua",
            "stored_player.lua",
            "/path/to/player.lua",
            "text/plain",
            FileType.Lua,
            1024L,
            hash,
            DateTime.UtcNow);
    }
}
