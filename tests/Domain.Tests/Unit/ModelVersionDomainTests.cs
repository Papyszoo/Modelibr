using Domain.Models;
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
}
