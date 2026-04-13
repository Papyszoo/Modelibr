using Domain.Models;
using Xunit;

namespace Domain.Tests.Unit;

public class SpriteCategoryDomainTests
{
    [Fact]
    public void Create_WithValidData_ReturnsCategory()
    {
        var createdAt = DateTime.UtcNow;

        var category = SpriteCategory.Create("Characters", "Character sprites", null, createdAt);

        Assert.Equal("Characters", category.Name);
        Assert.Equal("Character sprites", category.Description);
        Assert.Null(category.ParentId);
        Assert.Equal(createdAt, category.CreatedAt);
    }

    [Fact]
    public void MoveTo_WithValidParent_UpdatesParentId()
    {
        var createdAt = DateTime.UtcNow;
        var updatedAt = createdAt.AddMinutes(1);
        var category = SpriteCategory.Create("FX", null, null, createdAt);

        category.MoveTo(42, updatedAt);

        Assert.Equal(42, category.ParentId);
        Assert.Equal(updatedAt, category.UpdatedAt);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Create_WithInvalidName_ThrowsArgumentException(string? name)
    {
        Assert.Throws<ArgumentException>(() => SpriteCategory.Create(name!, null, null, DateTime.UtcNow));
    }

    [Fact]
    public void Update_WithNullDescription_ClearsDescription()
    {
        var category = SpriteCategory.Create("Original", "Original description", null, DateTime.UtcNow);

        category.Update("Updated", null, DateTime.UtcNow.AddMinutes(1));

        Assert.Equal("Updated", category.Name);
        Assert.Null(category.Description);
    }
}
