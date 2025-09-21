using Domain.Models;
using Domain.ValueObjects;
using Xunit;
using DomainFile = Domain.Models.File;

namespace Domain.Tests.Unit;

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

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Create_WithInvalidStoredFileName_ThrowsArgumentException(string storedFileName)
    {
        // Act & Assert
        Assert.Throws<ArgumentException>(() => DomainFile.Create(
            "test.obj",
            storedFileName,
            "/path/to/file",
            "model/obj",
            FileType.Obj,
            1024,
            "a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890",
            DateTime.UtcNow
        ));
    }

    [Fact]
    public void Create_WithNullStoredFileName_ThrowsArgumentException()
    {
        // Act & Assert
        Assert.Throws<ArgumentException>(() => DomainFile.Create(
            "test.obj",
            null!,
            "/path/to/file",
            "model/obj",
            FileType.Obj,
            1024,
            "a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890",
            DateTime.UtcNow
        ));
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Create_WithInvalidFilePath_ThrowsArgumentException(string filePath)
    {
        // Act & Assert
        Assert.Throws<ArgumentException>(() => DomainFile.Create(
            "test.obj",
            "stored.obj",
            filePath,
            "model/obj",
            FileType.Obj,
            1024,
            "a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890",
            DateTime.UtcNow
        ));
    }

    [Fact]
    public void Create_WithNullFilePath_ThrowsArgumentException()
    {
        // Act & Assert
        Assert.Throws<ArgumentException>(() => DomainFile.Create(
            "test.obj",
            "stored.obj",
            null!,
            "model/obj",
            FileType.Obj,
            1024,
            "a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890",
            DateTime.UtcNow
        ));
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Create_WithInvalidMimeType_ThrowsArgumentException(string mimeType)
    {
        // Act & Assert
        Assert.Throws<ArgumentException>(() => DomainFile.Create(
            "test.obj",
            "stored.obj",
            "/path/to/file",
            mimeType,
            FileType.Obj,
            1024,
            "a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890",
            DateTime.UtcNow
        ));
    }

    [Fact]
    public void Create_WithNullMimeType_ThrowsArgumentException()
    {
        // Act & Assert
        Assert.Throws<ArgumentException>(() => DomainFile.Create(
            "test.obj",
            "stored.obj",
            "/path/to/file",
            null!,
            FileType.Obj,
            1024,
            "a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890",
            DateTime.UtcNow
        ));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    public void Create_WithInvalidSizeBytes_ThrowsArgumentException(long sizeBytes)
    {
        // Act & Assert
        Assert.Throws<ArgumentException>(() => DomainFile.Create(
            "test.obj",
            "stored.obj",
            "/path/to/file",
            "model/obj",
            FileType.Obj,
            sizeBytes,
            "a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890",
            DateTime.UtcNow
        ));
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("invalid")]
    [InlineData("a1b2c3")]
    public void Create_WithInvalidSha256Hash_ThrowsArgumentException(string sha256Hash)
    {
        // Act & Assert
        Assert.Throws<ArgumentException>(() => DomainFile.Create(
            "test.obj",
            "stored.obj",
            "/path/to/file",
            "model/obj",
            FileType.Obj,
            1024,
            sha256Hash,
            DateTime.UtcNow
        ));
    }

    [Fact]
    public void Create_WithNullSha256Hash_ThrowsArgumentException()
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
}