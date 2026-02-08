using Domain.Models;
using Domain.ValueObjects;
using Domain.Tests;
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
        Assert.Empty(model.Versions);
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

    // Note: Model.AddFile, Model.HasFile, and Model.Files tests removed
    // Files are now managed through ModelVersion.AddFile and ModelVersion.Files
    // See ModelVersionDomainTests.cs for file-related tests

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
        textureSet.WithId(1); // Set ID to simulate existing entity
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
        textureSet.WithId(123);
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
        textureSet1.WithId(1); // Simulate persisted texture set
        var textureSet2 = TextureSet.Create("Texture Set 2", DateTime.UtcNow);
        textureSet2.WithId(2); // Simulate persisted texture set
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

    [Fact]
    public void CreateVersion_CreatesNewVersionWithNumber1()
    {
        // Arrange
        var model = Model.Create("Test Model", DateTime.UtcNow);
        model.WithId(1); // Simulate persisted model
        var description = "Version 1";
        var createdAt = DateTime.UtcNow;

        // Act
        var version = model.CreateVersion(description, createdAt);

        // Assert
        Assert.Equal(1, version.VersionNumber);
        Assert.Equal(description, version.Description);
        Assert.Equal(model.Id, version.ModelId);
        Assert.Single(model.Versions);
    }

    [Fact]
    public void CreateVersion_WithExistingVersion_IncrementsVersionNumber()
    {
        // Arrange
        var model = Model.Create("Test Model", DateTime.UtcNow);
        model.WithId(1);
        model.CreateVersion("Version 1", DateTime.UtcNow);

        // Act
        var version2 = model.CreateVersion("Version 2", DateTime.UtcNow.AddMinutes(1));

        // Assert
        Assert.Equal(2, version2.VersionNumber);
        Assert.Equal(2, model.Versions.Count);
    }

    [Fact]
    public void GetVersions_ReturnsOrderedVersions()
    {
        // Arrange
        var model = Model.Create("Test Model", DateTime.UtcNow);
        model.WithId(1);
        model.CreateVersion("V1", DateTime.UtcNow);
        model.CreateVersion("V2", DateTime.UtcNow.AddMinutes(1));
        model.CreateVersion("V3", DateTime.UtcNow.AddMinutes(2));

        // Act
        var versions = model.GetVersions();

        // Assert
        Assert.Equal(3, versions.Count);
        Assert.Equal(1, versions[0].VersionNumber);
        Assert.Equal(2, versions[1].VersionNumber);
        Assert.Equal(3, versions[2].VersionNumber);
        Assert.IsAssignableFrom<IReadOnlyList<ModelVersion>>(versions);
    }

    [Fact]
    public void GetVersion_WithExistingVersionNumber_ReturnsVersion()
    {
        // Arrange
        var model = Model.Create("Test Model", DateTime.UtcNow);
        model.WithId(1);
        model.CreateVersion("V1", DateTime.UtcNow);
        model.CreateVersion("V2", DateTime.UtcNow.AddMinutes(1));

        // Act
        var version = model.GetVersion(2);

        // Assert
        Assert.NotNull(version);
        Assert.Equal(2, version.VersionNumber);
    }

    [Fact]
    public void GetVersion_WithNonExistingVersionNumber_ReturnsNull()
    {
        // Arrange
        var model = Model.Create("Test Model", DateTime.UtcNow);
        model.WithId(1);

        // Act
        var version = model.GetVersion(999);

        // Assert
        Assert.Null(version);
    }

    [Fact]
    public void HasVersion_WithExistingVersionNumber_ReturnsTrue()
    {
        // Arrange
        var model = Model.Create("Test Model", DateTime.UtcNow);
        model.WithId(1);
        model.CreateVersion("V1", DateTime.UtcNow);

        // Act
        var hasVersion = model.HasVersion(1);

        // Assert
        Assert.True(hasVersion);
    }

    [Fact]
    public void HasVersion_WithNonExistingVersionNumber_ReturnsFalse()
    {
        // Arrange
        var model = Model.Create("Test Model", DateTime.UtcNow);

        // Act
        var hasVersion = model.HasVersion(999);

        // Assert
        Assert.False(hasVersion);
    }



    #endregion
}
