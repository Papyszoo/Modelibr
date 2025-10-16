using Application.Abstractions.Repositories;
using Domain.Models;
using Domain.ValueObjects;
using Infrastructure.Persistence;
using Infrastructure.Repositories;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Infrastructure.Tests.Integration;

public class BatchUploadPersistenceTests
{
    [Fact]
    public async Task CanPersistBatchUpload()
    {
        // Arrange
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: "TestDb_BatchUpload_" + Guid.NewGuid())
            .Options;

        await using var context = new ApplicationDbContext(options);
        var repository = new BatchUploadRepository(context);

        // Create a file first (required for FK)
        var now = DateTime.UtcNow;
        var file = Domain.Models.File.Create(
            "test.obj",
            "stored_test.obj",
            "/tmp/test.obj",
            "model/obj",
            FileType.Obj,
            1024,
            "abc123hash",
            now);
        
        context.Files.Add(file);
        await context.SaveChangesAsync();

        // Create batch upload
        var batchUpload = BatchUpload.Create(
            "batch-123",
            "model",
            file.Id,
            now);

        // Act
        await repository.AddAsync(batchUpload, CancellationToken.None);

        // Assert
        var retrieved = await context.BatchUploads.FirstOrDefaultAsync();
        Assert.NotNull(retrieved);
        Assert.Equal("batch-123", retrieved.BatchId);
        Assert.Equal("model", retrieved.UploadType);
        Assert.Equal(file.Id, retrieved.FileId);
    }

    [Fact]
    public async Task CanRetrieveBatchUploadsByBatchId()
    {
        // Arrange
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: "TestDb_BatchUpload_Query_" + Guid.NewGuid())
            .Options;

        await using var context = new ApplicationDbContext(options);
        var repository = new BatchUploadRepository(context);

        // Create files
        var now = DateTime.UtcNow;
        var file1 = Domain.Models.File.Create("test1.obj", "stored1.obj", "/tmp/test1.obj", "model/obj", FileType.Obj, 1024, "hash1", now);
        var file2 = Domain.Models.File.Create("test2.obj", "stored2.obj", "/tmp/test2.obj", "model/obj", FileType.Obj, 2048, "hash2", now);
        
        context.Files.AddRange(file1, file2);
        await context.SaveChangesAsync();

        // Create batch uploads
        var batchId = "batch-456";
        var batchUpload1 = BatchUpload.Create(batchId, "model", file1.Id, now);
        var batchUpload2 = BatchUpload.Create(batchId, "model", file2.Id, now.AddSeconds(1));
        
        await repository.AddAsync(batchUpload1, CancellationToken.None);
        await repository.AddAsync(batchUpload2, CancellationToken.None);

        // Act
        var results = await repository.GetByBatchIdAsync(batchId, CancellationToken.None);

        // Assert
        Assert.Equal(2, results.Count());
        Assert.All(results, bu => Assert.Equal(batchId, bu.BatchId));
    }

    [Fact]
    public async Task CanRetrieveBatchUploadsByUploadType()
    {
        // Arrange
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: "TestDb_BatchUpload_ByType_" + Guid.NewGuid())
            .Options;

        await using var context = new ApplicationDbContext(options);
        var repository = new BatchUploadRepository(context);

        // Create files
        var now = DateTime.UtcNow;
        var file1 = Domain.Models.File.Create("test1.obj", "stored1.obj", "/tmp/test1.obj", "model/obj", FileType.Obj, 1024, "hash1", now);
        var file2 = Domain.Models.File.Create("test2.png", "stored2.png", "/tmp/test2.png", "image/png", FileType.Texture, 2048, "hash2", now);
        
        context.Files.AddRange(file1, file2);
        await context.SaveChangesAsync();

        // Create batch uploads with different types
        var modelBatchUpload = BatchUpload.Create("batch-1", "model", file1.Id, now);
        var textureBatchUpload = BatchUpload.Create("batch-2", "textureSet", file2.Id, now);
        
        await repository.AddAsync(modelBatchUpload, CancellationToken.None);
        await repository.AddAsync(textureBatchUpload, CancellationToken.None);

        // Act
        var modelResults = await repository.GetByUploadTypeAsync("model", CancellationToken.None);

        // Assert
        Assert.Single(modelResults);
        Assert.All(modelResults, bu => Assert.Equal("model", bu.UploadType));
    }

    [Fact]
    public async Task CanRetrieveBatchUploadsByDateRange()
    {
        // Arrange
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: "TestDb_BatchUpload_DateRange_" + Guid.NewGuid())
            .Options;

        await using var context = new ApplicationDbContext(options);
        var repository = new BatchUploadRepository(context);

        // Create file
        var now = DateTime.UtcNow;
        var file = Domain.Models.File.Create("test.obj", "stored.obj", "/tmp/test.obj", "model/obj", FileType.Obj, 1024, "hash", now);
        context.Files.Add(file);
        await context.SaveChangesAsync();

        // Create batch uploads at different times
        var batchUpload1 = BatchUpload.Create("batch-1", "model", file.Id, now.AddHours(-2));
        var batchUpload2 = BatchUpload.Create("batch-2", "model", file.Id, now.AddHours(-1));
        var batchUpload3 = BatchUpload.Create("batch-3", "model", file.Id, now.AddHours(1));
        
        context.BatchUploads.AddRange(batchUpload1, batchUpload2, batchUpload3);
        await context.SaveChangesAsync();

        // Act
        var results = await repository.GetByDateRangeAsync(now.AddHours(-1.5), now.AddHours(-0.5), CancellationToken.None);

        // Assert
        Assert.Single(results);
        Assert.Equal("batch-2", results.First().BatchId);
    }
}
