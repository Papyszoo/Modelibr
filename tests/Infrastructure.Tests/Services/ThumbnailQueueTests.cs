using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Domain.Models;
using Domain.ValueObjects;
using Infrastructure.Services;
using Microsoft.Extensions.Logging;
using Moq;
using Xunit;

namespace Infrastructure.Tests.Services;

public class ThumbnailQueueTests
{
    private readonly Mock<IThumbnailJobRepository> _mockRepository;
    private readonly Mock<IThumbnailJobQueueNotificationService> _mockQueueNotificationService;
    private readonly Mock<ILogger<ThumbnailQueue>> _mockLogger;
    private readonly ThumbnailQueue _thumbnailQueue;

    public ThumbnailQueueTests()
    {
        _mockRepository = new Mock<IThumbnailJobRepository>();
        _mockQueueNotificationService = new Mock<IThumbnailJobQueueNotificationService>();
        _mockLogger = new Mock<ILogger<ThumbnailQueue>>();
        _thumbnailQueue = new ThumbnailQueue(_mockRepository.Object, _mockQueueNotificationService.Object, _mockLogger.Object);
    }

    [Fact]
    public async Task EnqueueAsync_WhenNoExistingJob_ShouldCreateNewJob()
    {
        // Arrange
        var modelId = 1;
        var modelHash = "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
        var expectedJob = ThumbnailJob.Create(modelId, modelHash, DateTime.UtcNow);

        _mockRepository.Setup(r => r.GetByModelHashAsync(modelHash, It.IsAny<CancellationToken>()))
            .ReturnsAsync((ThumbnailJob?)null);
        _mockRepository.Setup(r => r.AddAsync(It.IsAny<ThumbnailJob>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(expectedJob);

        // Act
        var result = await _thumbnailQueue.EnqueueAsync(modelId, modelHash);

        // Assert
        Assert.NotNull(result);
        Assert.Equal(modelId, result.ModelId);
        Assert.Equal(modelHash, result.ModelHash);
        Assert.Equal(ThumbnailJobStatus.Pending, result.Status);

        _mockRepository.Verify(r => r.GetByModelHashAsync(modelHash, It.IsAny<CancellationToken>()), Times.Once);
        _mockRepository.Verify(r => r.AddAsync(It.IsAny<ThumbnailJob>(), It.IsAny<CancellationToken>()), Times.Once);
        _mockQueueNotificationService.Verify(s => s.NotifyJobEnqueuedAsync(It.IsAny<ThumbnailJob>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task EnqueueAsync_WhenJobExists_ShouldReturnExistingJob()
    {
        // Arrange
        var modelId = 1;
        var modelHash = "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
        var existingJob = ThumbnailJob.Create(modelId, modelHash, DateTime.UtcNow);

        _mockRepository.Setup(r => r.GetByModelHashAsync(modelHash, It.IsAny<CancellationToken>()))
            .ReturnsAsync(existingJob);

        // Act
        var result = await _thumbnailQueue.EnqueueAsync(modelId, modelHash);

        // Assert
        Assert.Same(existingJob, result);

        _mockRepository.Verify(r => r.GetByModelHashAsync(modelHash, It.IsAny<CancellationToken>()), Times.Once);
        _mockRepository.Verify(r => r.AddAsync(It.IsAny<ThumbnailJob>(), It.IsAny<CancellationToken>()), Times.Never);
        _mockQueueNotificationService.Verify(s => s.NotifyJobEnqueuedAsync(It.IsAny<ThumbnailJob>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task DequeueAsync_WhenJobAvailable_ShouldClaimAndReturnJob()
    {
        // Arrange
        var workerId = "worker-1";
        var modelHash = "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
        var job = ThumbnailJob.Create(1, modelHash, DateTime.UtcNow);

        _mockRepository.Setup(r => r.GetNextPendingJobAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(job);

        // Act
        var result = await _thumbnailQueue.DequeueAsync(workerId);

        // Assert
        Assert.NotNull(result);
        Assert.Equal(workerId, result.LockedBy);
        Assert.Equal(ThumbnailJobStatus.Processing, result.Status);
        Assert.Equal(1, result.AttemptCount);

        _mockRepository.Verify(r => r.GetNextPendingJobAsync(It.IsAny<CancellationToken>()), Times.Once);
        _mockRepository.Verify(r => r.UpdateAsync(job, It.IsAny<CancellationToken>()), Times.Once);
        _mockQueueNotificationService.Verify(s => s.NotifyJobStatusChangedAsync(job.Id, ThumbnailJobStatus.Processing.ToString(), workerId, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task DequeueAsync_WhenNoJobAvailable_ShouldReturnNull()
    {
        // Arrange
        var workerId = "worker-1";

        _mockRepository.Setup(r => r.GetNextPendingJobAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync((ThumbnailJob?)null);

        // Act
        var result = await _thumbnailQueue.DequeueAsync(workerId);

        // Assert
        Assert.Null(result);

        _mockRepository.Verify(r => r.GetNextPendingJobAsync(It.IsAny<CancellationToken>()), Times.Once);
        _mockRepository.Verify(r => r.UpdateAsync(It.IsAny<ThumbnailJob>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task MarkCompletedAsync_WithValidJob_ShouldUpdateJobAsCompleted()
    {
        // Arrange
        var jobId = 1;
        var modelHash = "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
        var job = ThumbnailJob.Create(1, modelHash, DateTime.UtcNow);
        job.TryClaim("worker-1", DateTime.UtcNow);

        _mockRepository.Setup(r => r.GetByIdAsync(jobId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(job);

        // Act
        await _thumbnailQueue.MarkCompletedAsync(jobId);

        // Assert
        Assert.Equal(ThumbnailJobStatus.Done, job.Status);
        Assert.NotNull(job.CompletedAt);

        _mockRepository.Verify(r => r.GetByIdAsync(jobId, It.IsAny<CancellationToken>()), Times.Once);
        _mockRepository.Verify(r => r.UpdateAsync(job, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task MarkFailedAsync_WithinMaxAttempts_ShouldRetryJob()
    {
        // Arrange
        var jobId = 1;
        var errorMessage = "Processing failed";
        var modelHash = "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
        var job = ThumbnailJob.Create(1, modelHash, DateTime.UtcNow);
        job.TryClaim("worker-1", DateTime.UtcNow);

        _mockRepository.Setup(r => r.GetByIdAsync(jobId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(job);

        // Act
        await _thumbnailQueue.MarkFailedAsync(jobId, errorMessage);

        // Assert
        Assert.Equal(ThumbnailJobStatus.Pending, job.Status);
        Assert.Equal(errorMessage, job.ErrorMessage);
        Assert.Equal(1, job.AttemptCount);

        _mockRepository.Verify(r => r.GetByIdAsync(jobId, It.IsAny<CancellationToken>()), Times.Once);
        _mockRepository.Verify(r => r.UpdateAsync(job, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task MarkFailedAsync_ExceedsMaxAttempts_ShouldMoveToDeadLetter()
    {
        // Arrange
        var jobId = 1;
        var errorMessage = "Processing failed";
        var modelHash = "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
        var job = ThumbnailJob.Create(1, modelHash, DateTime.UtcNow, maxAttempts: 1);
        job.TryClaim("worker-1", DateTime.UtcNow);

        _mockRepository.Setup(r => r.GetByIdAsync(jobId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(job);

        // Act
        await _thumbnailQueue.MarkFailedAsync(jobId, errorMessage);

        // Assert
        Assert.Equal(ThumbnailJobStatus.Dead, job.Status);
        Assert.Equal(errorMessage, job.ErrorMessage);
        Assert.NotNull(job.CompletedAt);

        _mockRepository.Verify(r => r.GetByIdAsync(jobId, It.IsAny<CancellationToken>()), Times.Once);
        _mockRepository.Verify(r => r.UpdateAsync(job, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task RetryJobAsync_WithValidJob_ShouldResetJob()
    {
        // Arrange
        var jobId = 1;
        var modelHash = "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
        var job = ThumbnailJob.Create(1, modelHash, DateTime.UtcNow);
        job.TryClaim("worker-1", DateTime.UtcNow);
        job.MarkAsFailed("Error", DateTime.UtcNow);

        _mockRepository.Setup(r => r.GetByIdAsync(jobId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(job);

        // Act
        await _thumbnailQueue.RetryJobAsync(jobId);

        // Assert
        Assert.Equal(ThumbnailJobStatus.Pending, job.Status);
        Assert.Equal(0, job.AttemptCount);
        Assert.Null(job.ErrorMessage);
        Assert.Null(job.LockedBy);

        _mockRepository.Verify(r => r.GetByIdAsync(jobId, It.IsAny<CancellationToken>()), Times.Once);
        _mockRepository.Verify(r => r.UpdateAsync(job, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task RetryJobAsync_WithValidJob_ShouldNotifyWorkersOfAvailableJob()
    {
        // Arrange
        var jobId = 1;
        var modelHash = "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
        var job = ThumbnailJob.Create(1, modelHash, DateTime.UtcNow);
        job.TryClaim("worker-1", DateTime.UtcNow);
        job.MarkAsFailed("Error", DateTime.UtcNow);

        _mockRepository.Setup(r => r.GetByIdAsync(jobId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(job);

        // Act
        await _thumbnailQueue.RetryJobAsync(jobId);

        // Assert - Verify that workers are notified of the available job
        _mockQueueNotificationService.Verify(s => s.NotifyJobEnqueuedAsync(job, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task CleanupExpiredLocksAsync_WithExpiredJobs_ShouldResetThem()
    {
        // Arrange
        var modelHash1 = "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
        var modelHash2 = "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
        
        var expiredJob1 = ThumbnailJob.Create(1, modelHash1, DateTime.UtcNow);
        var expiredJob2 = ThumbnailJob.Create(2, modelHash2, DateTime.UtcNow);
        
        // Simulate expired locks
        expiredJob1.TryClaim("worker-1", DateTime.UtcNow.AddMinutes(-15));
        expiredJob2.TryClaim("worker-2", DateTime.UtcNow.AddMinutes(-20));

        var expiredJobs = new List<ThumbnailJob> { expiredJob1, expiredJob2 };

        _mockRepository.Setup(r => r.GetJobsWithExpiredLocksAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(expiredJobs);

        // Act
        var result = await _thumbnailQueue.CleanupExpiredLocksAsync();

        // Assert
        Assert.Equal(2, result);
        Assert.Equal(ThumbnailJobStatus.Pending, expiredJob1.Status);
        Assert.Equal(ThumbnailJobStatus.Pending, expiredJob2.Status);
        Assert.Null(expiredJob1.LockedBy);
        Assert.Null(expiredJob2.LockedBy);

        _mockRepository.Verify(r => r.GetJobsWithExpiredLocksAsync(It.IsAny<CancellationToken>()), Times.Once);
        _mockRepository.Verify(r => r.UpdateAsync(It.IsAny<ThumbnailJob>(), It.IsAny<CancellationToken>()), Times.Exactly(2));
    }

    [Fact]
    public async Task CancelActiveJobsForModelAsync_WithActiveJobs_ShouldCancelThem()
    {
        // Arrange
        var modelId = 1;
        var modelHash1 = "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
        var modelHash2 = "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
        
        var pendingJob = ThumbnailJob.Create(modelId, modelHash1, DateTime.UtcNow);
        var processingJob = ThumbnailJob.Create(modelId, modelHash2, DateTime.UtcNow);
        processingJob.TryClaim("worker-1", DateTime.UtcNow);

        var activeJobs = new List<ThumbnailJob> { pendingJob, processingJob };

        _mockRepository.Setup(r => r.GetActiveJobsByModelIdAsync(modelId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(activeJobs);

        // Act
        var result = await _thumbnailQueue.CancelActiveJobsForModelAsync(modelId);

        // Assert
        Assert.Equal(2, result);
        Assert.Equal(ThumbnailJobStatus.Dead, pendingJob.Status);
        Assert.Equal(ThumbnailJobStatus.Dead, processingJob.Status);
        Assert.Equal("Job cancelled due to model configuration change", pendingJob.ErrorMessage);
        Assert.Equal("Job cancelled due to model configuration change", processingJob.ErrorMessage);
        Assert.NotNull(pendingJob.CompletedAt);
        Assert.NotNull(processingJob.CompletedAt);

        _mockRepository.Verify(r => r.GetActiveJobsByModelIdAsync(modelId, It.IsAny<CancellationToken>()), Times.Once);
        _mockRepository.Verify(r => r.UpdateAsync(It.IsAny<ThumbnailJob>(), It.IsAny<CancellationToken>()), Times.Exactly(2));
    }

    [Fact]
    public async Task CancelActiveJobsForModelAsync_WithNoActiveJobs_ShouldReturnZero()
    {
        // Arrange
        var modelId = 1;
        var emptyList = new List<ThumbnailJob>();

        _mockRepository.Setup(r => r.GetActiveJobsByModelIdAsync(modelId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(emptyList);

        // Act
        var result = await _thumbnailQueue.CancelActiveJobsForModelAsync(modelId);

        // Assert
        Assert.Equal(0, result);

        _mockRepository.Verify(r => r.GetActiveJobsByModelIdAsync(modelId, It.IsAny<CancellationToken>()), Times.Once);
        _mockRepository.Verify(r => r.UpdateAsync(It.IsAny<ThumbnailJob>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task CancelActiveJobsForModelAsync_WithOnlyPendingJob_ShouldCancelIt()
    {
        // Arrange
        var modelId = 1;
        var modelHash = "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
        var pendingJob = ThumbnailJob.Create(modelId, modelHash, DateTime.UtcNow);

        var activeJobs = new List<ThumbnailJob> { pendingJob };

        _mockRepository.Setup(r => r.GetActiveJobsByModelIdAsync(modelId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(activeJobs);

        // Act
        var result = await _thumbnailQueue.CancelActiveJobsForModelAsync(modelId);

        // Assert
        Assert.Equal(1, result);
        Assert.Equal(ThumbnailJobStatus.Dead, pendingJob.Status);
        Assert.Equal("Job cancelled due to model configuration change", pendingJob.ErrorMessage);

        _mockRepository.Verify(r => r.GetActiveJobsByModelIdAsync(modelId, It.IsAny<CancellationToken>()), Times.Once);
        _mockRepository.Verify(r => r.UpdateAsync(pendingJob, It.IsAny<CancellationToken>()), Times.Once);
    }
}
