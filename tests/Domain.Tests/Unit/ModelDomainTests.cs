using Domain.Models;
using Domain.ValueObjects;
using Xunit;
using DomainFile = Domain.Models.File;

namespace Domain.Tests.Unit;

public class ModelDomainTests
{
    [Fact]
    public void Create_WithValidData_ReturnsModel()
    {
        // Arrange
        var name = "Test Model";
        var createdAt = DateTime.UtcNow;

        // Act
        var model = Model.Create(name, createdAt);

        // Assert
        Assert.Equal(name, model.Name);
        Assert.Equal(createdAt, model.CreatedAt);
        Assert.Equal(createdAt, model.UpdatedAt);
        Assert.Empty(model.Files);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Create_WithInvalidName_ThrowsArgumentException(string name)
    {
        // Arrange
        var createdAt = DateTime.UtcNow;

        // Act & Assert
        Assert.Throws<ArgumentException>(() => Model.Create(name, createdAt));
    }

    [Fact]
    public void Create_WithNullName_ThrowsArgumentException()
    {
        // Arrange
        var createdAt = DateTime.UtcNow;

        // Act & Assert
        Assert.Throws<ArgumentException>(() => Model.Create(null!, createdAt));
    }

    [Fact]
    public void Create_WithTooLongName_ThrowsArgumentException()
    {
        // Arrange
        var name = new string('a', 201);
        var createdAt = DateTime.UtcNow;

        // Act & Assert
        Assert.Throws<ArgumentException>(() => Model.Create(name, createdAt));
    }

    [Fact]
    public void UpdateName_WithValidData_UpdatesNameAndTime()
    {
        // Arrange
        var model = Model.Create("Test Model", DateTime.UtcNow);
        var newName = "Updated Model";
        var beforeUpdate = DateTime.UtcNow;
        var updatedAt = DateTime.UtcNow;

        // Act
        model.UpdateName(newName, updatedAt);

        // Assert
        Assert.Equal(newName, model.Name);
        Assert.True(model.UpdatedAt >= beforeUpdate);
    }

    [Fact]
    public void AddFile_WithValidFile_AddsFileAndUpdatesTime()
    {
        // Arrange
        var model = Model.Create("Test Model", DateTime.UtcNow);
        var file = DomainFile.Create(
            "test.obj",
            "stored.obj",
            "/path/to/file",
            "model/obj",
            FileType.Obj,
            1024,
            "a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890",
            DateTime.UtcNow
        );
        var beforeUpdate = DateTime.UtcNow;
        var updatedAt = DateTime.UtcNow;

        // Act
        model.AddFile(file, updatedAt);

        // Assert
        Assert.Single(model.Files);
        Assert.Contains(file, model.Files);
        Assert.True(model.UpdatedAt >= beforeUpdate);
    }

    [Fact]
    public void AddFile_WithDuplicateFile_DoesNotAddDuplicate()
    {
        // Arrange
        var model = Model.Create("Test Model", DateTime.UtcNow);
        var file = DomainFile.Create(
            "test.obj",
            "stored.obj",
            "/path/to/file",
            "model/obj",
            FileType.Obj,
            1024,
            "a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890",
            DateTime.UtcNow
        );
        var updatedAt = DateTime.UtcNow;

        // Act
        model.AddFile(file, updatedAt);
        model.AddFile(file, updatedAt);

        // Assert
        Assert.Single(model.Files);
    }

    [Fact]
    public void HasFile_WithExistingFile_ReturnsTrue()
    {
        // Arrange
        var model = Model.Create("Test Model", DateTime.UtcNow);
        var hash = "a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890";
        var file = DomainFile.Create(
            "test.obj",
            "stored.obj",
            "/path/to/file",
            "model/obj",
            FileType.Obj,
            1024,
            hash,
            DateTime.UtcNow
        );
        var updatedAt = DateTime.UtcNow;
        model.AddFile(file, updatedAt);

        // Act
        var hasFile = model.HasFile(hash);

        // Assert
        Assert.True(hasFile);
    }

    [Fact]
    public void HasFile_WithNonExistingFile_ReturnsFalse()
    {
        // Arrange
        var model = Model.Create("Test Model", DateTime.UtcNow);
        var hash = "nonexistent1234567890123456789012345678901234567890123456789012";

        // Act
        var hasFile = model.HasFile(hash);

        // Assert
        Assert.False(hasFile);
    }

    #region TextureSet Association Tests

    [Fact]
    public void AddTextureSet_WithValidTextureSet_AddsSuccessfully()
    {
        // Arrange
        var model = Model.Create("Test Model", DateTime.UtcNow);
        var textureSet = TextureSet.Create("Test Texture Set", DateTime.UtcNow);
        var updatedAt = DateTime.UtcNow.AddMinutes(1);

        // Act
        model.AddTextureSet(textureSet, updatedAt);

        // Assert
        Assert.Single(model.TextureSets);
        Assert.Contains(textureSet, model.TextureSets);
        Assert.Equal(updatedAt, model.UpdatedAt);
    }

    [Fact]
    public void AddTextureSet_WithNullTextureSet_ThrowsArgumentNullException()
    {
        // Arrange
        var model = Model.Create("Test Model", DateTime.UtcNow);
        var updatedAt = DateTime.UtcNow.AddMinutes(1);

        // Act & Assert
        Assert.Throws<ArgumentNullException>(() => model.AddTextureSet(null!, updatedAt));
    }

    [Fact]
    public void AddTextureSet_WithExistingTextureSet_DoesNotAddDuplicate()
    {
        // Arrange
        var model = Model.Create("Test Model", DateTime.UtcNow);
        var textureSet = TextureSet.Create("Test Texture Set", DateTime.UtcNow);
        textureSet.Id = 1; // Set ID to simulate existing entity
        var updatedAt = DateTime.UtcNow.AddMinutes(1);
        model.AddTextureSet(textureSet, updatedAt);

        // Act
        model.AddTextureSet(textureSet, updatedAt.AddMinutes(1));

        // Assert
        Assert.Single(model.TextureSets);
    }

    [Fact]
    public void RemoveTextureSet_WithExistingTextureSet_RemovesSuccessfully()
    {
        // Arrange
        var model = Model.Create("Test Model", DateTime.UtcNow);
        var textureSet = TextureSet.Create("Test Texture Set", DateTime.UtcNow);
        var updatedAt = DateTime.UtcNow.AddMinutes(1);
        model.AddTextureSet(textureSet, updatedAt);

        // Act
        model.RemoveTextureSet(textureSet, updatedAt.AddMinutes(1));

        // Assert
        Assert.Empty(model.TextureSets);
        Assert.Equal(updatedAt.AddMinutes(1), model.UpdatedAt);
    }

    [Fact]
    public void RemoveTextureSet_WithNullTextureSet_ThrowsArgumentNullException()
    {
        // Arrange
        var model = Model.Create("Test Model", DateTime.UtcNow);
        var updatedAt = DateTime.UtcNow.AddMinutes(1);

        // Act & Assert
        Assert.Throws<ArgumentNullException>(() => model.RemoveTextureSet(null!, updatedAt));
    }

    [Fact]
    public void HasTextureSet_WithExistingTextureSet_ReturnsTrue()
    {
        // Arrange
        var model = Model.Create("Test Model", DateTime.UtcNow);
        var textureSet = TextureSet.Create("Test Texture Set", DateTime.UtcNow);
        textureSet.Id = 123;
        model.AddTextureSet(textureSet, DateTime.UtcNow.AddMinutes(1));

        // Act
        var hasTextureSet = model.HasTextureSet(123);

        // Assert
        Assert.True(hasTextureSet);
    }

    [Fact]
    public void HasTextureSet_WithNonExistingTextureSet_ReturnsFalse()
    {
        // Arrange
        var model = Model.Create("Test Model", DateTime.UtcNow);

        // Act
        var hasTextureSet = model.HasTextureSet(999);

        // Assert
        Assert.False(hasTextureSet);
    }

    [Fact]
    public void GetTextureSets_ReturnsReadOnlyList()
    {
        // Arrange
        var model = Model.Create("Test Model", DateTime.UtcNow);
        var textureSet1 = TextureSet.Create("Texture Set 1", DateTime.UtcNow);
        var textureSet2 = TextureSet.Create("Texture Set 2", DateTime.UtcNow);
        model.AddTextureSet(textureSet1, DateTime.UtcNow.AddMinutes(1));
        model.AddTextureSet(textureSet2, DateTime.UtcNow.AddMinutes(2));

        // Act
        var textureSets = model.GetTextureSets();

        // Assert
        Assert.Equal(2, textureSets.Count);
        Assert.Contains(textureSet1, textureSets);
        Assert.Contains(textureSet2, textureSets);
        Assert.IsAssignableFrom<IReadOnlyList<TextureSet>>(textureSets);
    }

    #endregion
}