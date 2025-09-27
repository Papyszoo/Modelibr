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

    #region TexturePack Association Tests

    [Fact]
    public void AddTexturePack_WithValidTexturePack_AddsSuccessfully()
    {
        // Arrange
        var model = Model.Create("Test Model", DateTime.UtcNow);
        var texturePack = TexturePack.Create("Test Texture Pack", DateTime.UtcNow);
        var updatedAt = DateTime.UtcNow.AddMinutes(1);

        // Act
        model.AddTexturePack(texturePack, updatedAt);

        // Assert
        Assert.Single(model.TexturePacks);
        Assert.Contains(texturePack, model.TexturePacks);
        Assert.Equal(updatedAt, model.UpdatedAt);
    }

    [Fact]
    public void AddTexturePack_WithNullTexturePack_ThrowsArgumentNullException()
    {
        // Arrange
        var model = Model.Create("Test Model", DateTime.UtcNow);
        var updatedAt = DateTime.UtcNow.AddMinutes(1);

        // Act & Assert
        Assert.Throws<ArgumentNullException>(() => model.AddTexturePack(null!, updatedAt));
    }

    [Fact]
    public void AddTexturePack_WithExistingTexturePack_DoesNotAddDuplicate()
    {
        // Arrange
        var model = Model.Create("Test Model", DateTime.UtcNow);
        var texturePack = TexturePack.Create("Test Texture Pack", DateTime.UtcNow);
        texturePack.Id = 1; // Set ID to simulate existing entity
        var updatedAt = DateTime.UtcNow.AddMinutes(1);
        model.AddTexturePack(texturePack, updatedAt);

        // Act
        model.AddTexturePack(texturePack, updatedAt.AddMinutes(1));

        // Assert
        Assert.Single(model.TexturePacks);
    }

    [Fact]
    public void RemoveTexturePack_WithExistingTexturePack_RemovesSuccessfully()
    {
        // Arrange
        var model = Model.Create("Test Model", DateTime.UtcNow);
        var texturePack = TexturePack.Create("Test Texture Pack", DateTime.UtcNow);
        var updatedAt = DateTime.UtcNow.AddMinutes(1);
        model.AddTexturePack(texturePack, updatedAt);

        // Act
        model.RemoveTexturePack(texturePack, updatedAt.AddMinutes(1));

        // Assert
        Assert.Empty(model.TexturePacks);
        Assert.Equal(updatedAt.AddMinutes(1), model.UpdatedAt);
    }

    [Fact]
    public void RemoveTexturePack_WithNullTexturePack_ThrowsArgumentNullException()
    {
        // Arrange
        var model = Model.Create("Test Model", DateTime.UtcNow);
        var updatedAt = DateTime.UtcNow.AddMinutes(1);

        // Act & Assert
        Assert.Throws<ArgumentNullException>(() => model.RemoveTexturePack(null!, updatedAt));
    }

    [Fact]
    public void HasTexturePack_WithExistingTexturePack_ReturnsTrue()
    {
        // Arrange
        var model = Model.Create("Test Model", DateTime.UtcNow);
        var texturePack = TexturePack.Create("Test Texture Pack", DateTime.UtcNow);
        texturePack.Id = 123;
        model.AddTexturePack(texturePack, DateTime.UtcNow.AddMinutes(1));

        // Act
        var hasTexturePack = model.HasTexturePack(123);

        // Assert
        Assert.True(hasTexturePack);
    }

    [Fact]
    public void HasTexturePack_WithNonExistingTexturePack_ReturnsFalse()
    {
        // Arrange
        var model = Model.Create("Test Model", DateTime.UtcNow);

        // Act
        var hasTexturePack = model.HasTexturePack(999);

        // Assert
        Assert.False(hasTexturePack);
    }

    [Fact]
    public void GetTexturePacks_ReturnsReadOnlyList()
    {
        // Arrange
        var model = Model.Create("Test Model", DateTime.UtcNow);
        var texturePack1 = TexturePack.Create("Texture Pack 1", DateTime.UtcNow);
        var texturePack2 = TexturePack.Create("Texture Pack 2", DateTime.UtcNow);
        model.AddTexturePack(texturePack1, DateTime.UtcNow.AddMinutes(1));
        model.AddTexturePack(texturePack2, DateTime.UtcNow.AddMinutes(2));

        // Act
        var texturePacks = model.GetTexturePacks();

        // Assert
        Assert.Equal(2, texturePacks.Count);
        Assert.Contains(texturePack1, texturePacks);
        Assert.Contains(texturePack2, texturePacks);
        Assert.IsAssignableFrom<IReadOnlyList<TexturePack>>(texturePacks);
    }

    #endregion
}