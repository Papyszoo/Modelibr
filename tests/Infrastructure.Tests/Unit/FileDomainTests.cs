using Domain.Models;
using Domain.ValueObjects;
using Xunit;
using DomainFile = Domain.Models.File;

namespace Infrastructure.Tests.Unit;

public class FileDomainTests
{
    [Fact]
    public void Create_WithValidData_ReturnsFile()
    {
        // Arrange
        var originalFileName = "test.obj";
        var storedFileName = "stored_hash.obj";
        var filePath = "/path/to/file";
        var mimeType = "model/obj";
        var fileType = FileType.Obj;
        var sizeBytes = 1024L;
        var sha256Hash = "a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890";
        var createdAt = DateTime.UtcNow;

        // Act
        var file = DomainFile.Create(
            originalFileName,
            storedFileName,
            filePath,
            mimeType,
            fileType,
            sizeBytes,
            sha256Hash,
            createdAt
        );

        // Assert
        Assert.Equal(originalFileName, file.OriginalFileName);
        Assert.Equal(storedFileName, file.StoredFileName);
        Assert.Equal(filePath, file.FilePath);
        Assert.Equal(mimeType, file.MimeType);
        Assert.Equal(fileType, file.FileType);
        Assert.Equal(sizeBytes, file.SizeBytes);
        Assert.Equal(sha256Hash.ToLowerInvariant(), file.Sha256Hash);
        Assert.Equal(createdAt, file.CreatedAt);
        Assert.Equal(createdAt, file.UpdatedAt);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Create_WithInvalidOriginalFileName_ThrowsArgumentException(string originalFileName)
    {
        // Act & Assert
        Assert.Throws<ArgumentException>(() => DomainFile.Create(
            originalFileName,
            "stored.obj",
            "/path/to/file",
            "model/obj",
            FileType.Obj,
            1024,
            "a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890",
            DateTime.UtcNow
        ));
    }

    [Fact]
    public void Create_WithNullOriginalFileName_ThrowsArgumentException()
    {
        // Act & Assert
        Assert.Throws<ArgumentException>(() => DomainFile.Create(
            null!,
            "stored.obj",
            "/path/to/file",
            "model/obj",
            FileType.Obj,
            1024,
            "a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890",
            DateTime.UtcNow
        ));
    }

    [Fact]
    public void Create_WithTooLongFileName_ThrowsArgumentException()
    {
        // Arrange
        var longFileName = new string('a', 256); // 256 characters

        // Act & Assert
        var exception = Assert.Throws<ArgumentException>(() => DomainFile.Create(
            longFileName,
            "stored.obj",
            "/path/to/file",
            "model/obj",
            FileType.Obj,
            1024,
            "a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890",
            DateTime.UtcNow
        ));
        Assert.Contains("cannot exceed 255 characters", exception.Message);
    }

    [Fact]
    public void Create_WithNegativeSize_ThrowsArgumentException()
    {
        // Act & Assert
        var exception = Assert.Throws<ArgumentException>(() => DomainFile.Create(
            "test.obj",
            "stored.obj",
            "/path/to/file",
            "model/obj",
            FileType.Obj,
            -1, // Negative size
            "a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890",
            DateTime.UtcNow
        ));
        Assert.Contains("cannot be negative", exception.Message);
    }

    [Fact]
    public void Create_WithTooLargeSize_ThrowsArgumentException()
    {
        // Act & Assert
        var exception = Assert.Throws<ArgumentException>(() => DomainFile.Create(
            "test.obj",
            "stored.obj",
            "/path/to/file",
            "model/obj",
            FileType.Obj,
            1_073_741_825, // 1GB + 1 byte
            "a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890",
            DateTime.UtcNow
        ));
        Assert.Contains("cannot exceed 1GB", exception.Message);
    }

    [Theory]
    [InlineData("")]
    [InlineData("invalid_hash")]
    [InlineData("a1b2c3d4e5f67890123456789012345678901234567890123456789012345678")] // 63 chars
    [InlineData("a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890z")] // 65 chars
    [InlineData("g1h2i3j4k5l6789012345678901234567890123456789012345678901234567890")] // Invalid hex
    public void Create_WithInvalidHash_ThrowsArgumentException(string invalidHash)
    {
        // Act & Assert
        Assert.Throws<ArgumentException>(() => DomainFile.Create(
            "test.obj",
            "stored.obj",
            "/path/to/file",
            "model/obj",
            FileType.Obj,
            1024,
            invalidHash,
            DateTime.UtcNow
        ));
    }

    [Fact]
    public void Create_WithNullHash_ThrowsArgumentException()
    {
        // Act & Assert
        Assert.Throws<ArgumentException>(() => DomainFile.Create(
            "test.obj",
            "stored.obj",
            "/path/to/file",
            "model/obj",
            FileType.Obj,
            1024,
            null!,
            DateTime.UtcNow
        ));
    }

    [Fact]
    public void UpdateSize_WithValidSize_UpdatesSizeAndTime()
    {
        // Arrange
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
        var newSize = 2048L;
        var updatedAt = DateTime.UtcNow.AddMinutes(1);

        // Act
        file.UpdateSize(newSize, updatedAt);

        // Assert
        Assert.Equal(newSize, file.SizeBytes);
        Assert.Equal(updatedAt, file.UpdatedAt);
    }

    [Fact]
    public void IsLinkedToModel_WithLinkedModel_ReturnsTrue()
    {
        // Arrange
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
        var model = Model.Create("Test Model", DateTime.UtcNow);
        
        // Simulate EF Core linking
        file.Models.Add(model);

        // Act
        var isLinked = file.IsLinkedToModel(model.Id);

        // Assert
        Assert.True(isLinked);
    }

    [Fact]
    public void IsLinkedToModel_WithNonLinkedModel_ReturnsFalse()
    {
        // Arrange
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

        // Act
        var isLinked = file.IsLinkedToModel(999);

        // Assert
        Assert.False(isLinked);
    }
}