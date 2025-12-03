using Domain.Models;
using Domain.ValueObjects;
using Xunit;
using DomainFile = Domain.Models.File;

namespace Domain.Tests.Unit;

public class SpriteDomainTests
{
    [Fact]
    public void Create_WithValidData_ReturnsSprite()
    {
        // Arrange
        var name = "My Sprite";
        var file = CreateValidSpriteFile();
        var spriteType = SpriteType.Static;
        var createdAt = DateTime.UtcNow;

        // Act
        var sprite = Sprite.Create(name, file, spriteType, createdAt);

        // Assert
        Assert.NotNull(sprite);
        Assert.Equal(name, sprite.Name);
        Assert.Equal(spriteType, sprite.SpriteType);
        Assert.Equal(createdAt, sprite.CreatedAt);
        Assert.Equal(createdAt, sprite.UpdatedAt);
        Assert.False(sprite.IsDeleted);
        Assert.Null(sprite.DeletedAt);
        Assert.Null(sprite.SpriteCategoryId);
    }

    [Fact]
    public void Create_WithCategory_SetsCategoryId()
    {
        // Arrange
        var name = "My Sprite";
        var file = CreateValidSpriteFile();
        var spriteType = SpriteType.Static;
        var createdAt = DateTime.UtcNow;
        var categoryId = 1;

        // Act
        var sprite = Sprite.Create(name, file, spriteType, createdAt, categoryId);

        // Assert
        Assert.Equal(categoryId, sprite.SpriteCategoryId);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Create_WithInvalidName_ThrowsArgumentException(string? name)
    {
        // Arrange
        var file = CreateValidSpriteFile();
        var createdAt = DateTime.UtcNow;

        // Act & Assert
        Assert.Throws<ArgumentException>(() => Sprite.Create(name!, file, SpriteType.Static, createdAt));
    }

    [Fact]
    public void Create_WithNameTooLong_ThrowsArgumentException()
    {
        // Arrange
        var name = new string('a', 201); // 201 characters, exceeds 200 limit
        var file = CreateValidSpriteFile();
        var createdAt = DateTime.UtcNow;

        // Act & Assert
        var exception = Assert.Throws<ArgumentException>(() => Sprite.Create(name, file, SpriteType.Static, createdAt));
        Assert.Contains("200 characters", exception.Message);
    }

    [Fact]
    public void Create_WithNullFile_ThrowsArgumentNullException()
    {
        // Arrange
        var name = "My Sprite";
        var createdAt = DateTime.UtcNow;

        // Act & Assert
        Assert.Throws<ArgumentNullException>(() => Sprite.Create(name, null!, SpriteType.Static, createdAt));
    }

    [Fact]
    public void UpdateName_WithValidName_UpdatesNameAndTimestamp()
    {
        // Arrange
        var sprite = CreateValidSprite();
        var newName = "Updated Sprite";
        var updatedAt = DateTime.UtcNow.AddMinutes(1);

        // Act
        sprite.UpdateName(newName, updatedAt);

        // Assert
        Assert.Equal(newName, sprite.Name);
        Assert.Equal(updatedAt, sprite.UpdatedAt);
    }

    [Fact]
    public void UpdateSpriteType_WithValidType_UpdatesTypeAndTimestamp()
    {
        // Arrange
        var sprite = CreateValidSprite(SpriteType.Static);
        var newType = SpriteType.Gif;
        var updatedAt = DateTime.UtcNow.AddMinutes(1);

        // Act
        sprite.UpdateSpriteType(newType, updatedAt);

        // Assert
        Assert.Equal(newType, sprite.SpriteType);
        Assert.Equal(updatedAt, sprite.UpdatedAt);
    }

    [Fact]
    public void UpdateCategory_UpdatesCategoryAndTimestamp()
    {
        // Arrange
        var sprite = CreateValidSprite();
        var categoryId = 5;
        var updatedAt = DateTime.UtcNow.AddMinutes(1);

        // Act
        sprite.UpdateCategory(categoryId, updatedAt);

        // Assert
        Assert.Equal(categoryId, sprite.SpriteCategoryId);
        Assert.Equal(updatedAt, sprite.UpdatedAt);
    }

    [Fact]
    public void UpdateCategory_WithNull_RemovesCategory()
    {
        // Arrange
        var sprite = CreateValidSprite();
        sprite.UpdateCategory(5, DateTime.UtcNow);
        var updatedAt = DateTime.UtcNow.AddMinutes(1);

        // Act
        sprite.UpdateCategory(null, updatedAt);

        // Assert
        Assert.Null(sprite.SpriteCategoryId);
        Assert.Equal(updatedAt, sprite.UpdatedAt);
    }

    [Fact]
    public void IsAnimated_WithStaticType_ReturnsFalse()
    {
        // Arrange
        var sprite = CreateValidSprite(SpriteType.Static);

        // Act
        var isAnimated = sprite.IsAnimated();

        // Assert
        Assert.False(isAnimated);
    }

    [Theory]
    [InlineData(SpriteType.Gif)]
    [InlineData(SpriteType.SpriteSheet)]
    [InlineData(SpriteType.Apng)]
    [InlineData(SpriteType.AnimatedWebP)]
    public void IsAnimated_WithAnimatedTypes_ReturnsTrue(SpriteType spriteType)
    {
        // Arrange
        var sprite = CreateValidSprite(spriteType);

        // Act
        var isAnimated = sprite.IsAnimated();

        // Assert
        Assert.True(isAnimated);
    }

    [Fact]
    public void IsOfType_WithMatchingType_ReturnsTrue()
    {
        // Arrange
        var sprite = CreateValidSprite(SpriteType.Gif);

        // Act & Assert
        Assert.True(sprite.IsOfType(SpriteType.Gif));
        Assert.False(sprite.IsOfType(SpriteType.Static));
    }

    [Fact]
    public void GetDescription_ReturnsCorrectFormat()
    {
        // Arrange
        var name = "My Sprite";
        var file = CreateValidSpriteFile();
        var sprite = Sprite.Create(name, file, SpriteType.Static, DateTime.UtcNow);

        // Act
        var description = sprite.GetDescription();

        // Assert
        Assert.Contains(name, description);
        Assert.Contains("Static", description);
    }

    [Fact]
    public void SoftDelete_MarksAsDeleted()
    {
        // Arrange
        var sprite = CreateValidSprite();
        var deletedAt = DateTime.UtcNow.AddMinutes(1);

        // Act
        sprite.SoftDelete(deletedAt);

        // Assert
        Assert.True(sprite.IsDeleted);
        Assert.Equal(deletedAt, sprite.DeletedAt);
        Assert.Equal(deletedAt, sprite.UpdatedAt);
    }

    [Fact]
    public void Restore_UnmarksAsDeleted()
    {
        // Arrange
        var sprite = CreateValidSprite();
        sprite.SoftDelete(DateTime.UtcNow);
        var restoredAt = DateTime.UtcNow.AddMinutes(1);

        // Act
        sprite.Restore(restoredAt);

        // Assert
        Assert.False(sprite.IsDeleted);
        Assert.Null(sprite.DeletedAt);
        Assert.Equal(restoredAt, sprite.UpdatedAt);
    }

    [Fact]
    public void Sprite_InheritsFromAggregateRoot()
    {
        // Arrange & Act
        var sprite = CreateValidSprite();

        // Assert
        Assert.IsAssignableFrom<AggregateRoot>(sprite);
        Assert.NotNull(sprite.DomainEvents);
        Assert.Empty(sprite.DomainEvents);
    }

    private static Sprite CreateValidSprite(SpriteType spriteType = SpriteType.Static)
    {
        var file = CreateValidSpriteFile();
        return Sprite.Create("Test Sprite", file, spriteType, DateTime.UtcNow);
    }

    private static DomainFile CreateValidSpriteFile()
    {
        return DomainFile.Create(
            "sprite.png",
            "stored_sprite.png",
            "/path/to/sprite.png",
            "image/png",
            FileType.Texture,
            1024L,
            "a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd",
            DateTime.UtcNow
        );
    }
}
