using Domain.Models;
using Xunit;

namespace Domain.Tests.Unit;

public class RecycledFileDomainTests
{
    [Fact]
    public void Create_WithValidData_ReturnsRecycledFile()
    {
        // Arrange
        var fileId = 1;
        var originalFileName = "test.obj";
        var storedFileName = "stored_hash.obj";
        var filePath = "/path/to/file";
        var sha256Hash = "a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890";
        var sizeBytes = 1024L;
        var reason = "File deleted by user";
        var recycledAt = DateTime.UtcNow;
        var scheduledDeletionAt = recycledAt.AddDays(30);

        // Act
        var recycledFile = RecycledFile.Create(
            fileId,
            originalFileName,
            storedFileName,
            filePath,
            sha256Hash,
            sizeBytes,
            reason,
            recycledAt,
            scheduledDeletionAt
        );

        // Assert
        Assert.Equal(fileId, recycledFile.FileId);
        Assert.Equal(originalFileName, recycledFile.OriginalFileName);
        Assert.Equal(storedFileName, recycledFile.StoredFileName);
        Assert.Equal(filePath, recycledFile.FilePath);
        Assert.Equal(sha256Hash.ToLowerInvariant(), recycledFile.Sha256Hash);
        Assert.Equal(sizeBytes, recycledFile.SizeBytes);
        Assert.Equal(reason, recycledFile.Reason);
        Assert.Equal(recycledAt, recycledFile.RecycledAt);
        Assert.Equal(scheduledDeletionAt, recycledFile.ScheduledDeletionAt);
    }

    [Fact]
    public void Create_WithoutScheduledDeletionAt_ReturnsRecycledFile()
    {
        // Arrange
        var fileId = 1;
        var originalFileName = "test.obj";
        var storedFileName = "stored_hash.obj";
        var filePath = "/path/to/file";
        var sha256Hash = "a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890";
        var sizeBytes = 1024L;
        var reason = "File deleted by user";
        var recycledAt = DateTime.UtcNow;

        // Act
        var recycledFile = RecycledFile.Create(
            fileId,
            originalFileName,
            storedFileName,
            filePath,
            sha256Hash,
            sizeBytes,
            reason,
            recycledAt
        );

        // Assert
        Assert.Equal(originalFileName, recycledFile.OriginalFileName);
        Assert.Equal(storedFileName, recycledFile.StoredFileName);
        Assert.Equal(filePath, recycledFile.FilePath);
        Assert.Equal(sha256Hash.ToLowerInvariant(), recycledFile.Sha256Hash);
        Assert.Equal(sizeBytes, recycledFile.SizeBytes);
        Assert.Equal(reason, recycledFile.Reason);
        Assert.Equal(recycledAt, recycledFile.RecycledAt);
        Assert.Null(recycledFile.ScheduledDeletionAt);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Create_WithInvalidOriginalFileName_ThrowsArgumentException(string originalFileName)
    {
        // Arrange
        var fileId = 1;
        var storedFileName = "stored_hash.obj";
        var filePath = "/path/to/file";
        var sha256Hash = "a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890";
        var sizeBytes = 1024L;
        var reason = "File deleted by user";
        var recycledAt = DateTime.UtcNow;

        // Act & Assert
        Assert.Throws<ArgumentException>(() => RecycledFile.Create(
            fileId,
            originalFileName,
            storedFileName,
            filePath,
            sha256Hash,
            sizeBytes,
            reason,
            recycledAt
        ));
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Create_WithInvalidReason_ThrowsArgumentException(string reason)
    {
        // Arrange
        var fileId = 1;
        var originalFileName = "test.obj";
        var storedFileName = "stored_hash.obj";
        var filePath = "/path/to/file";
        var sha256Hash = "a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890";
        var sizeBytes = 1024L;
        var recycledAt = DateTime.UtcNow;

        // Act & Assert
        Assert.Throws<ArgumentException>(() => RecycledFile.Create(
            fileId,
            originalFileName,
            storedFileName,
            filePath,
            sha256Hash,
            sizeBytes,
            reason,
            recycledAt
        ));
    }

    [Fact]
    public void Create_WithInvalidHash_ThrowsArgumentException()
    {
        // Arrange
        var fileId = 1;
        var originalFileName = "test.obj";
        var storedFileName = "stored_hash.obj";
        var filePath = "/path/to/file";
        var sha256Hash = "invalid_hash";
        var sizeBytes = 1024L;
        var reason = "File deleted by user";
        var recycledAt = DateTime.UtcNow;

        // Act & Assert
        Assert.Throws<ArgumentException>(() => RecycledFile.Create(
            fileId,
            originalFileName,
            storedFileName,
            filePath,
            sha256Hash,
            sizeBytes,
            reason,
            recycledAt
        ));
    }

    [Fact]
    public void Create_WithNegativeSizeBytes_ThrowsArgumentException()
    {
        // Arrange
        var fileId = 1;
        var originalFileName = "test.obj";
        var storedFileName = "stored_hash.obj";
        var filePath = "/path/to/file";
        var sha256Hash = "a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890";
        var sizeBytes = -1L;
        var reason = "File deleted by user";
        var recycledAt = DateTime.UtcNow;

        // Act & Assert
        Assert.Throws<ArgumentException>(() => RecycledFile.Create(
            fileId,
            originalFileName,
            storedFileName,
            filePath,
            sha256Hash,
            sizeBytes,
            reason,
            recycledAt
        ));
    }
}
