using Domain.Models;
using Domain.ValueObjects;
using Xunit;
using DomainFile = Domain.Models.File;

namespace Infrastructure.Tests.Unit;

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
        var name = new string('a', 201); // 201 characters
        var createdAt = DateTime.UtcNow;

        // Act & Assert
        var exception = Assert.Throws<ArgumentException>(() => Model.Create(name, createdAt));
        Assert.Contains("cannot exceed 200 characters", exception.Message);
    }

    [Fact]
    public void UpdateName_WithValidData_UpdatesNameAndTime()
    {
        // Arrange
        var model = Model.Create("Original Name", DateTime.UtcNow);
        var newName = "Updated Name";
        var updatedAt = DateTime.UtcNow.AddMinutes(1);

        // Act
        model.UpdateName(newName, updatedAt);

        // Assert
        Assert.Equal(newName, model.Name);
        Assert.Equal(updatedAt, model.UpdatedAt);
    }

    [Fact]
    public void AddFile_WithValidFile_AddsFileAndUpdatesTime()
    {
        // Arrange
        var model = Model.Create("Test Model", DateTime.UtcNow);
        var file = DomainFile.Create(
            "test.obj",
            "stored_hash.obj",
            "/path/to/file",
            "model/obj",
            FileType.Obj,
            1024,
            "a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890",
            DateTime.UtcNow
        );
        var updatedAt = DateTime.UtcNow.AddMinutes(1);

        // Act
        model.AddFile(file, updatedAt);

        // Assert
        Assert.Single(model.Files);
        Assert.Contains(file, model.Files);
        Assert.Equal(updatedAt, model.UpdatedAt);
    }

    [Fact]
    public void AddFile_WithDuplicateFile_DoesNotAddDuplicate()
    {
        // Arrange
        var model = Model.Create("Test Model", DateTime.UtcNow);
        var file1 = DomainFile.Create(
            "test.obj",
            "stored_hash.obj",
            "/path/to/file",
            "model/obj",
            FileType.Obj,
            1024,
            "a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890",
            DateTime.UtcNow
        );
        var file2 = DomainFile.Create(
            "test2.obj",
            "stored_hash2.obj",
            "/path/to/file2",
            "model/obj",
            FileType.Obj,
            2048,
            "a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890", // Same hash
            DateTime.UtcNow
        );

        // Act
        model.AddFile(file1, DateTime.UtcNow);
        model.AddFile(file2, DateTime.UtcNow); // Should not add duplicate

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
            "stored_hash.obj",
            "/path/to/file",
            "model/obj",
            FileType.Obj,
            1024,
            hash,
            DateTime.UtcNow
        );
        model.AddFile(file, DateTime.UtcNow);

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
}