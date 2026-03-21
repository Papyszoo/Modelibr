using Domain.Models;
using Domain.Tests;
using Xunit;
using DomainFile = Domain.Models.File;

namespace Domain.Tests.Unit;

public class ModelVersionDomainTests
{
    [Fact]
    public void Create_WithValidParameters_CreatesModelVersion()
    {
        // Arrange
        var modelId = 1;
        var versionNumber = 1;
        var description = "Initial version";
        var createdAt = DateTime.UtcNow;

        // Act
        var version = ModelVersion.Create(modelId, versionNumber, description, createdAt);

        // Assert
        Assert.Equal(modelId, version.ModelId);
        Assert.Equal(versionNumber, version.VersionNumber);
        Assert.Equal(description, version.Description);
        Assert.Equal(createdAt, version.CreatedAt);
    }

    [Fact]
    public void Create_WithNullDescription_CreatesModelVersion()
    {
        // Arrange
        var modelId = 1;
        var versionNumber = 1;
        var createdAt = DateTime.UtcNow;

        // Act
        var version = ModelVersion.Create(modelId, versionNumber, null, createdAt);

        // Assert
        Assert.Null(version.Description);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(-10)]
    public void Create_WithInvalidVersionNumber_ThrowsArgumentException(int invalidVersionNumber)
    {
        // Arrange
        var modelId = 1;
        var createdAt = DateTime.UtcNow;

        // Act & Assert
        Assert.Throws<ArgumentException>(() => 
            ModelVersion.Create(modelId, invalidVersionNumber, null, createdAt));
    }

    [Fact]
    public void UpdateDescription_UpdatesDescription()
    {
        // Arrange
        var version = ModelVersion.Create(1, 1, "Initial", DateTime.UtcNow);
        var newDescription = "Updated description";

        // Act
        version.UpdateDescription(newDescription);

        // Assert
        Assert.Equal(newDescription, version.Description);
    }

    [Fact]
    public void AddFile_AddsFileToVersion()
    {
        // Arrange
        var version = ModelVersion.Create(1, 1, null, DateTime.UtcNow);
        var file = DomainFile.Create(
            "test.blend",
            "stored.blend",
            "/path/to/stored.blend",
            "application/x-blender",
            Domain.ValueObjects.FileType.Blend,
            1024,
            "a" + new string('0', 63),
            DateTime.UtcNow);

        // Act
        version.AddFile(file);

        // Assert
        Assert.Single(version.Files);
        Assert.Contains(file, version.Files);
    }

    [Fact]
    public void AddFile_WithDuplicateHash_DoesNotAddFile()
    {
        // Arrange
        var version = ModelVersion.Create(1, 1, null, DateTime.UtcNow);
        var hash = "a" + new string('0', 63);
        var file1 = DomainFile.Create(
            "test1.blend",
            "stored1.blend",
            "/path/to/stored1.blend",
            "application/x-blender",
            Domain.ValueObjects.FileType.Blend,
            1024,
            hash,
            DateTime.UtcNow);
        var file2 = DomainFile.Create(
            "test2.blend",
            "stored2.blend",
            "/path/to/stored2.blend",
            "application/x-blender",
            Domain.ValueObjects.FileType.Blend,
            1024,
            hash,
            DateTime.UtcNow);

        // Act
        version.AddFile(file1);
        version.AddFile(file2);

        // Assert
        Assert.Single(version.Files);
    }

    [Fact]
    public void AddFile_WithNullFile_ThrowsArgumentNullException()
    {
        // Arrange
        var version = ModelVersion.Create(1, 1, null, DateTime.UtcNow);

        // Act & Assert
#pragma warning disable CS8625
        Assert.Throws<ArgumentNullException>(() => version.AddFile(null));
#pragma warning restore CS8625
    }

    [Fact]
    public void HasFile_WithExistingHash_ReturnsTrue()
    {
        // Arrange
        var version = ModelVersion.Create(1, 1, null, DateTime.UtcNow);
        var hash = "a" + new string('0', 63);
        var file = DomainFile.Create(
            "test.blend",
            "stored.blend",
            "/path/to/stored.blend",
            "application/x-blender",
            Domain.ValueObjects.FileType.Blend,
            1024,
            hash,
            DateTime.UtcNow);
        version.AddFile(file);

        // Act
        var result = version.HasFile(hash);

        // Assert
        Assert.True(result);
    }

    [Fact]
    public void HasFile_WithNonExistingHash_ReturnsFalse()
    {
        // Arrange
        var version = ModelVersion.Create(1, 1, null, DateTime.UtcNow);

        // Act
        var result = version.HasFile("nonexistent" + new string('0', 53));

        // Assert
        Assert.False(result);
    }

    [Fact]
    public void GetFiles_ReturnsReadOnlyList()
    {
        // Arrange
        var version = ModelVersion.Create(1, 1, null, DateTime.UtcNow);
        var file = DomainFile.Create(
            "test.blend",
            "stored.blend",
            "/path/to/stored.blend",
            "application/x-blender",
            Domain.ValueObjects.FileType.Blend,
            1024,
            "a" + new string('0', 63),
            DateTime.UtcNow);
        version.AddFile(file);

        // Act
        var files = version.GetFiles();

        // Assert
        Assert.IsAssignableFrom<IReadOnlyList<DomainFile>>(files);
        Assert.Single(files);
    }

    [Fact]
    public void AddTextureMapping_AddsTextureMappingToVersion()
    {
        // Arrange
        var version = ModelVersion.Create(1, 1, null, DateTime.UtcNow);
        var updatedAt = DateTime.UtcNow;

        // Act
        version.AddTextureMapping(1, "", updatedAt);

        // Assert
        Assert.Single(version.TextureMappings);
        Assert.Equal(1, version.TextureMappings.First().TextureSetId);
        Assert.Equal(updatedAt, version.UpdatedAt);
    }

    [Fact]
    public void AddTextureMapping_WithDuplicateMapping_DoesNotAdd()
    {
        // Arrange
        var version = ModelVersion.Create(1, 1, null, DateTime.UtcNow);
        var updatedAt = DateTime.UtcNow;

        // Act
        version.AddTextureMapping(1, "", updatedAt);
        version.AddTextureMapping(1, "", updatedAt);

        // Assert
        Assert.Single(version.TextureMappings);
    }

    [Fact]
    public void AddTextureMapping_WithNamedMaterial_ReplacesExistingMapping()
    {
        // Arrange
        var version = ModelVersion.Create(1, 1, null, DateTime.UtcNow);
        var updatedAt = DateTime.UtcNow;

        // Act
        version.AddTextureMapping(1, "Body", updatedAt);
        version.AddTextureMapping(2, "Body", updatedAt);

        // Assert - named materials enforce one texture set per material
        Assert.Single(version.TextureMappings);
        Assert.Equal(2, version.TextureMappings.First().TextureSetId);
    }

    [Fact]
    public void RemoveTextureMappingsByTextureSetId_RemovesMappingFromVersion()
    {
        // Arrange
        var version = ModelVersion.Create(1, 1, null, DateTime.UtcNow);
        version.AddTextureMapping(1, "", DateTime.UtcNow);
        var updatedAt = DateTime.UtcNow;

        // Act
        version.RemoveTextureMappingsByTextureSetId(1, updatedAt);

        // Assert
        Assert.Empty(version.TextureMappings);
        Assert.Equal(updatedAt, version.UpdatedAt);
    }

    [Fact]
    public void RemoveTextureMappingsByTextureSetId_WithNonExisting_DoesNothing()
    {
        // Arrange
        var version = ModelVersion.Create(1, 1, null, DateTime.UtcNow);
        var initialUpdatedAt = version.UpdatedAt;

        // Act
        version.RemoveTextureMappingsByTextureSetId(999, DateTime.UtcNow);

        // Assert
        Assert.Empty(version.TextureMappings);
        Assert.Equal(initialUpdatedAt, version.UpdatedAt);
    }

    [Fact]
    public void HasTextureSet_WithExistingTextureSet_ReturnsTrue()
    {
        // Arrange
        var version = ModelVersion.Create(1, 1, null, DateTime.UtcNow);
        version.AddTextureMapping(1, "", DateTime.UtcNow);

        // Act
        var result = version.HasTextureSet(1);

        // Assert
        Assert.True(result);
    }

    [Fact]
    public void HasTextureSet_WithNonExistingTextureSet_ReturnsFalse()
    {
        // Arrange
        var version = ModelVersion.Create(1, 1, null, DateTime.UtcNow);

        // Act
        var result = version.HasTextureSet(1);

        // Assert
        Assert.False(result);
    }

    [Fact]
    public void GetTextureMappings_ReturnsReadOnlyList()
    {
        // Arrange
        var version = ModelVersion.Create(1, 1, null, DateTime.UtcNow);
        version.AddTextureMapping(1, "", DateTime.UtcNow);

        // Act
        var mappings = version.GetTextureMappings();

        // Assert
        Assert.IsAssignableFrom<IReadOnlyList<ModelVersionTextureSet>>(mappings);
        Assert.Single(mappings);
    }

    [Fact]
    public void SetDefaultTextureSet_WithAssociatedTextureSet_SetsDefault()
    {
        // Arrange
        var version = ModelVersion.Create(1, 1, null, DateTime.UtcNow);
        version.AddTextureMapping(1, "", DateTime.UtcNow);
        var updatedAt = DateTime.UtcNow;

        // Act
        version.SetDefaultTextureSet(1, updatedAt);

        // Assert
        Assert.Equal(1, version.DefaultTextureSetId);
        Assert.Equal(updatedAt, version.UpdatedAt);
    }

    [Fact]
    public void SetDefaultTextureSet_WithNull_ClearsDefault()
    {
        // Arrange
        var version = ModelVersion.Create(1, 1, null, DateTime.UtcNow);
        version.AddTextureMapping(1, "", DateTime.UtcNow);
        version.SetDefaultTextureSet(1, DateTime.UtcNow);
        var updatedAt = DateTime.UtcNow;

        // Act
        version.SetDefaultTextureSet(null, updatedAt);

        // Assert
        Assert.Null(version.DefaultTextureSetId);
        Assert.Equal(updatedAt, version.UpdatedAt);
    }

    [Fact]
    public void SetDefaultTextureSet_WithNonAssociatedTextureSet_ThrowsInvalidOperationException()
    {
        // Arrange
        var version = ModelVersion.Create(1, 1, null, DateTime.UtcNow);

        // Act & Assert
        Assert.Throws<InvalidOperationException>(() => 
            version.SetDefaultTextureSet(1, DateTime.UtcNow));
    }

    [Fact]
    public void SetMaterialNames_SetsMaterialNames()
    {
        // Arrange
        var version = ModelVersion.Create(1, 1, null, DateTime.UtcNow);
        var materialNames = new List<string> { "Body", "Head", "Eyes" };
        var updatedAt = DateTime.UtcNow;

        // Act
        version.SetMaterialNames(materialNames, updatedAt);

        // Assert
        Assert.Equal(3, version.MaterialNames.Count);
        Assert.Contains("Body", version.MaterialNames);
        Assert.Equal(updatedAt, version.UpdatedAt);
    }

    [Fact]
    public void RemoveTextureMappingByMaterial_RemovesSpecificMaterialMapping()
    {
        // Arrange
        var version = ModelVersion.Create(1, 1, null, DateTime.UtcNow);
        version.AddTextureMapping(1, "Body", DateTime.UtcNow);
        version.AddTextureMapping(2, "Head", DateTime.UtcNow);
        var updatedAt = DateTime.UtcNow;

        // Act
        version.RemoveTextureMappingByMaterial("Body", updatedAt);

        // Assert
        Assert.Single(version.TextureMappings);
        Assert.Equal("Head", version.TextureMappings.First().MaterialName);
        Assert.Equal(updatedAt, version.UpdatedAt);
    }

}
