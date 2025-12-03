using Domain.Models;
using Xunit;

namespace Domain.Tests.Unit;

public class SpriteCategoryDomainTests
{
    [Fact]
    public void Create_WithValidData_ReturnsCategory()
    {
        // Arrange
        var name = "Characters";
        var description = "Character sprites";
        var createdAt = DateTime.UtcNow;

        // Act
        var category = SpriteCategory.Create(name, description, createdAt);

        // Assert
        Assert.NotNull(category);
        Assert.Equal(name, category.Name);
        Assert.Equal(description, category.Description);
        Assert.Equal(createdAt, category.CreatedAt);
        Assert.Equal(createdAt, category.UpdatedAt);
    }

    [Fact]
    public void Create_WithNullDescription_ReturnsCategory()
    {
        // Arrange
        var name = "Characters";
        var createdAt = DateTime.UtcNow;

        // Act
        var category = SpriteCategory.Create(name, null, createdAt);

        // Assert
        Assert.NotNull(category);
        Assert.Equal(name, category.Name);
        Assert.Null(category.Description);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Create_WithInvalidName_ThrowsArgumentException(string? name)
    {
        // Arrange
        var createdAt = DateTime.UtcNow;

        // Act & Assert
        Assert.Throws<ArgumentException>(() => SpriteCategory.Create(name!, null, createdAt));
    }

    [Fact]
    public void Create_WithNameTooLong_ThrowsArgumentException()
    {
        // Arrange
        var name = new string('a', 101); // 101 characters, exceeds 100 limit
        var createdAt = DateTime.UtcNow;

        // Act & Assert
        var exception = Assert.Throws<ArgumentException>(() => SpriteCategory.Create(name, null, createdAt));
        Assert.Contains("100 characters", exception.Message);
    }

    [Fact]
    public void Create_WithDescriptionTooLong_ThrowsArgumentException()
    {
        // Arrange
        var name = "Characters";
        var description = new string('a', 501); // 501 characters, exceeds 500 limit
        var createdAt = DateTime.UtcNow;

        // Act & Assert
        var exception = Assert.Throws<ArgumentException>(() => SpriteCategory.Create(name, description, createdAt));
        Assert.Contains("500 characters", exception.Message);
    }

    [Fact]
    public void Update_WithValidData_UpdatesCategory()
    {
        // Arrange
        var category = SpriteCategory.Create("Original", "Original description", DateTime.UtcNow);
        var newName = "Updated";
        var newDescription = "Updated description";
        var updatedAt = DateTime.UtcNow.AddMinutes(1);

        // Act
        category.Update(newName, newDescription, updatedAt);

        // Assert
        Assert.Equal(newName, category.Name);
        Assert.Equal(newDescription, category.Description);
        Assert.Equal(updatedAt, category.UpdatedAt);
    }

    [Fact]
    public void Update_WithNullDescription_ClearsDescription()
    {
        // Arrange
        var category = SpriteCategory.Create("Original", "Original description", DateTime.UtcNow);
        var newName = "Updated";
        var updatedAt = DateTime.UtcNow.AddMinutes(1);

        // Act
        category.Update(newName, null, updatedAt);

        // Assert
        Assert.Equal(newName, category.Name);
        Assert.Null(category.Description);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Update_WithInvalidName_ThrowsArgumentException(string? name)
    {
        // Arrange
        var category = SpriteCategory.Create("Original", null, DateTime.UtcNow);
        var updatedAt = DateTime.UtcNow.AddMinutes(1);

        // Act & Assert
        Assert.Throws<ArgumentException>(() => category.Update(name!, null, updatedAt));
    }

    [Fact]
    public void SpriteCategory_InheritsFromAggregateRoot()
    {
        // Arrange & Act
        var category = SpriteCategory.Create("Test", null, DateTime.UtcNow);

        // Assert
        Assert.IsAssignableFrom<AggregateRoot>(category);
        Assert.NotNull(category.DomainEvents);
        Assert.Empty(category.DomainEvents);
    }
}
