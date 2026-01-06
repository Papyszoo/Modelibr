using Domain.Models;
using Xunit;

namespace Domain.Tests.Unit;

public class BatchUploadDomainTests
{
    [Fact]
    public void Create_WithValidData_ReturnsBatchUpload()
    {
        // Arrange
        var batchId = "batch-123";
        var uploadType = "model";
        var fileId = 1;
        var uploadedAt = DateTime.UtcNow;
        var modelId = 10;

        // Act
        var batchUpload = BatchUpload.Create(batchId, uploadType, fileId, uploadedAt, modelId: modelId);

        // Assert
        Assert.Equal(batchId, batchUpload.BatchId);
        Assert.Equal("model", batchUpload.UploadType);
        Assert.Equal(fileId, batchUpload.FileId);
        Assert.Equal(uploadedAt, batchUpload.UploadedAt);
        Assert.Equal(modelId, batchUpload.ModelId);
        Assert.Null(batchUpload.PackId);
        Assert.Null(batchUpload.TextureSetId);
    }

    [Fact]
    public void Create_WithPackUpload_ReturnsBatchUploadWithPackId()
    {
        // Arrange
        var batchId = "batch-456";
        var uploadType = "pack";
        var fileId = 2;
        var uploadedAt = DateTime.UtcNow;
        var packId = 5;

        // Act
        var batchUpload = BatchUpload.Create(batchId, uploadType, fileId, uploadedAt, packId: packId);

        // Assert
        Assert.Equal(batchId, batchUpload.BatchId);
        Assert.Equal("pack", batchUpload.UploadType);
        Assert.Equal(packId, batchUpload.PackId);
        Assert.Null(batchUpload.ModelId);
        Assert.Null(batchUpload.TextureSetId);
    }

    [Fact]
    public void Create_WithTextureSetUpload_ReturnsBatchUploadWithTextureSetId()
    {
        // Arrange
        var batchId = "batch-789";
        var uploadType = "textureSet";
        var fileId = 3;
        var uploadedAt = DateTime.UtcNow;
        var textureSetId = 15;

        // Act
        var batchUpload = BatchUpload.Create(batchId, uploadType, fileId, uploadedAt, textureSetId: textureSetId);

        // Assert
        Assert.Equal(batchId, batchUpload.BatchId);
        Assert.Equal("textureset", batchUpload.UploadType); // Should be normalized to lowercase
        Assert.Equal(textureSetId, batchUpload.TextureSetId);
        Assert.Null(batchUpload.ModelId);
        Assert.Null(batchUpload.PackId);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    public void Create_WithInvalidBatchId_ThrowsArgumentException(string batchId)
    {
        // Arrange
        var uploadType = "model";
        var fileId = 1;
        var uploadedAt = DateTime.UtcNow;

        // Act & Assert
        Assert.Throws<ArgumentException>(() => 
            BatchUpload.Create(batchId!, uploadType, fileId, uploadedAt));
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    public void Create_WithInvalidUploadType_ThrowsArgumentException(string uploadType)
    {
        // Arrange
        var batchId = "batch-123";
        var fileId = 1;
        var uploadedAt = DateTime.UtcNow;

        // Act & Assert
        Assert.Throws<ArgumentException>(() => 
            BatchUpload.Create(batchId, uploadType!, fileId, uploadedAt));
    }

    [Theory]
    [InlineData("invalid")]
    [InlineData("random")]
    [InlineData("unsupported")]
    public void Create_WithUnsupportedUploadType_ThrowsArgumentException(string uploadType)
    {
        // Arrange
        var batchId = "batch-123";
        var fileId = 1;
        var uploadedAt = DateTime.UtcNow;

        // Act & Assert
        var exception = Assert.Throws<ArgumentException>(() => 
            BatchUpload.Create(batchId, uploadType, fileId, uploadedAt));
        Assert.Contains("Upload type must be one of:", exception.Message);
    }

    [Theory]
    [InlineData("model")]
    [InlineData("MODEL")]
    [InlineData("Model")]
    [InlineData("pack")]
    [InlineData("PACK")]
    [InlineData("textureSet")]
    [InlineData("TEXTURESET")]
    public void Create_WithValidUploadType_NormalizesToLowercase(string uploadType)
    {
        // Arrange
        var batchId = "batch-123";
        var fileId = 1;
        var uploadedAt = DateTime.UtcNow;

        // Act
        var batchUpload = BatchUpload.Create(batchId, uploadType, fileId, uploadedAt);

        // Assert
        Assert.Equal(uploadType.ToLowerInvariant(), batchUpload.UploadType);
    }
}
