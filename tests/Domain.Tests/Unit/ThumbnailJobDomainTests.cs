using Domain.Models;
using Domain.ValueObjects;
using Xunit;

namespace Domain.Tests.Unit;

public class ThumbnailJobDomainTests
{
    [Fact]
    public void Create_WithValidParameters_ShouldCreateThumbnailJob()
    {
        // Arrange
        var modelId = 1;
        var modelHash = "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
        var createdAt = DateTime.UtcNow;
        var maxAttempts = 3;
        var lockTimeoutMinutes = 10;

        // Act
        var job = ThumbnailJob.Create(modelId, modelHash, createdAt, maxAttempts, lockTimeoutMinutes);

        // Assert
        Assert.NotNull(job);
        Assert.Equal(modelId, job.ModelId);
        Assert.Equal(modelHash, job.ModelHash);
        Assert.Equal(ThumbnailJobStatus.Pending, job.Status);
        Assert.Equal(0, job.AttemptCount);
        Assert.Equal(maxAttempts, job.MaxAttempts);
        Assert.Equal(lockTimeoutMinutes, job.LockTimeoutMinutes);
        Assert.Equal(createdAt, job.CreatedAt);
        Assert.Equal(createdAt, job.UpdatedAt);
        Assert.Null(job.LockedBy);
        Assert.Null(job.LockedAt);
        Assert.Null(job.CompletedAt);
        Assert.Null(job.ErrorMessage);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    public void Create_WithInvalidModelId_ShouldThrowArgumentException(int invalidModelId)
    {
        // Arrange
        var modelHash = "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
        var createdAt = DateTime.UtcNow;

        // Act & Assert
        Assert.Throws<ArgumentException>(() => 
            ThumbnailJob.Create(invalidModelId, modelHash, createdAt));
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("short")]
    [InlineData("1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1")] // 65 chars
    public void Create_WithInvalidModelHash_ShouldThrowArgumentException(string invalidHash)
    {
        // Arrange
        var modelId = 1;
        var createdAt = DateTime.UtcNow;

        // Act & Assert
        Assert.Throws<ArgumentException>(() => 
            ThumbnailJob.Create(modelId, invalidHash, createdAt));
    }

    [Fact]
    public void TryClaim_WithValidWorker_ShouldClaimJob()
    {
        // Arrange
        var job = CreateTestJob();
        var workerId = "worker-1";
        var claimedAt = DateTime.UtcNow;

        // Act
        var result = job.TryClaim(workerId, claimedAt);

        // Assert
        Assert.True(result);
        Assert.Equal(ThumbnailJobStatus.Processing, job.Status);
        Assert.Equal(workerId, job.LockedBy);
        Assert.Equal(claimedAt, job.LockedAt);
        Assert.Equal(1, job.AttemptCount);
        Assert.Equal(claimedAt, job.UpdatedAt);
    }

    [Fact]
    public void TryClaim_WhenAlreadyProcessingWithValidLock_ShouldFail()
    {
        // Arrange
        var job = CreateTestJob();
        var firstWorker = "worker-1";
        var secondWorker = "worker-2";
        var firstClaimTime = DateTime.UtcNow;
        var secondClaimTime = firstClaimTime.AddMinutes(5); // Within lock timeout

        job.TryClaim(firstWorker, firstClaimTime);

        // Act
        var result = job.TryClaim(secondWorker, secondClaimTime);

        // Assert
        Assert.False(result);
        Assert.Equal(ThumbnailJobStatus.Processing, job.Status);
        Assert.Equal(firstWorker, job.LockedBy);
        Assert.Equal(1, job.AttemptCount);
    }

    [Fact]
    public void TryClaim_WhenLockExpired_ShouldSucceed()
    {
        // Arrange
        var job = CreateTestJob();
        var firstWorker = "worker-1";
        var secondWorker = "worker-2";
        var firstClaimTime = DateTime.UtcNow;
        var secondClaimTime = firstClaimTime.AddMinutes(15); // Beyond lock timeout

        job.TryClaim(firstWorker, firstClaimTime);

        // Act
        var result = job.TryClaim(secondWorker, secondClaimTime);

        // Assert
        Assert.True(result);
        Assert.Equal(ThumbnailJobStatus.Processing, job.Status);
        Assert.Equal(secondWorker, job.LockedBy);
        Assert.Equal(secondClaimTime, job.LockedAt);
        Assert.Equal(2, job.AttemptCount);
    }

    [Fact]
    public void MarkAsCompleted_ShouldUpdateJobStatus()
    {
        // Arrange
        var job = CreateTestJob();
        var workerId = "worker-1";
        var claimedAt = DateTime.UtcNow;
        var completedAt = claimedAt.AddMinutes(5);

        job.TryClaim(workerId, claimedAt);

        // Act
        job.MarkAsCompleted(completedAt);

        // Assert
        Assert.Equal(ThumbnailJobStatus.Done, job.Status);
        Assert.Equal(completedAt, job.CompletedAt);
        Assert.Equal(completedAt, job.UpdatedAt);
        Assert.Null(job.LockedBy);
        Assert.Null(job.LockedAt);
        Assert.Null(job.ErrorMessage);
    }

    [Fact]
    public void MarkAsFailed_WithinMaxAttempts_ShouldRetryJob()
    {
        // Arrange
        var job = CreateTestJob();
        var workerId = "worker-1";
        var claimedAt = DateTime.UtcNow;
        var failedAt = claimedAt.AddMinutes(5);
        var errorMessage = "Processing failed";

        job.TryClaim(workerId, claimedAt);

        // Act
        job.MarkAsFailed(errorMessage, failedAt);

        // Assert
        Assert.Equal(ThumbnailJobStatus.Pending, job.Status);
        Assert.Equal(errorMessage, job.ErrorMessage);
        Assert.Equal(failedAt, job.UpdatedAt);
        Assert.Null(job.LockedBy);
        Assert.Null(job.LockedAt);
        Assert.Null(job.CompletedAt);
        Assert.Equal(1, job.AttemptCount);
    }

    [Fact]
    public void MarkAsFailed_ExceedsMaxAttempts_ShouldMoveToDeadLetter()
    {
        // Arrange
        var job = CreateTestJob();
        var errorMessage = "Processing failed";

        // Simulate multiple failed attempts
        for (int i = 0; i < 3; i++)
        {
            job.TryClaim($"worker-{i}", DateTime.UtcNow);
            job.MarkAsFailed(errorMessage, DateTime.UtcNow);
        }

        // Act - Final attempt
        job.TryClaim("worker-final", DateTime.UtcNow);
        job.MarkAsFailed(errorMessage, DateTime.UtcNow);

        // Assert
        Assert.Equal(ThumbnailJobStatus.Dead, job.Status);
        Assert.Equal(errorMessage, job.ErrorMessage);
        Assert.NotNull(job.CompletedAt);
        Assert.Null(job.LockedBy);
        Assert.Null(job.LockedAt);
        Assert.Equal(4, job.AttemptCount); // 4 attempts (3 max + 1 final)
    }

    [Fact]
    public void Reset_ShouldResetJobToInitialState()
    {
        // Arrange
        var job = CreateTestJob();
        var workerId = "worker-1";
        var claimedAt = DateTime.UtcNow;
        var failedAt = claimedAt.AddMinutes(5);
        var resetAt = failedAt.AddMinutes(10);

        job.TryClaim(workerId, claimedAt);
        job.MarkAsFailed("Error", failedAt);

        // Act
        job.Reset(resetAt);

        // Assert
        Assert.Equal(ThumbnailJobStatus.Pending, job.Status);
        Assert.Equal(0, job.AttemptCount);
        Assert.Null(job.ErrorMessage);
        Assert.Null(job.LockedBy);
        Assert.Null(job.LockedAt);
        Assert.Null(job.CompletedAt);
        Assert.Equal(resetAt, job.UpdatedAt);
    }

    [Fact]
    public void IsLockExpired_WithExpiredLock_ShouldReturnTrue()
    {
        // Arrange
        var job = CreateTestJob();
        var workerId = "worker-1";
        var claimedAt = DateTime.UtcNow;
        var currentTime = claimedAt.AddMinutes(15); // Beyond lock timeout

        job.TryClaim(workerId, claimedAt);

        // Act
        var isExpired = job.IsLockExpired(currentTime);

        // Assert
        Assert.True(isExpired);
    }

    [Fact]
    public void IsLockExpired_WithValidLock_ShouldReturnFalse()
    {
        // Arrange
        var job = CreateTestJob();
        var workerId = "worker-1";
        var claimedAt = DateTime.UtcNow;
        var currentTime = claimedAt.AddMinutes(5); // Within lock timeout

        job.TryClaim(workerId, claimedAt);

        // Act
        var isExpired = job.IsLockExpired(currentTime);

        // Assert
        Assert.False(isExpired);
    }

    [Fact]
    public void Cancel_WithPendingJob_ShouldCancelSuccessfully()
    {
        // Arrange
        var job = CreateTestJob();
        var cancelledAt = DateTime.UtcNow;

        // Act
        job.Cancel(cancelledAt);

        // Assert
        Assert.Equal(ThumbnailJobStatus.Dead, job.Status);
        Assert.Equal("Job cancelled due to model configuration change", job.ErrorMessage);
        Assert.Equal(cancelledAt, job.CompletedAt);
        Assert.Equal(cancelledAt, job.UpdatedAt);
        Assert.Null(job.LockedBy);
        Assert.Null(job.LockedAt);
    }

    [Fact]
    public void Cancel_WithProcessingJob_ShouldCancelSuccessfully()
    {
        // Arrange
        var job = CreateTestJob();
        var workerId = "worker-1";
        var claimedAt = DateTime.UtcNow;
        var cancelledAt = claimedAt.AddMinutes(5);

        job.TryClaim(workerId, claimedAt);

        // Act
        job.Cancel(cancelledAt);

        // Assert
        Assert.Equal(ThumbnailJobStatus.Dead, job.Status);
        Assert.Equal("Job cancelled due to model configuration change", job.ErrorMessage);
        Assert.Equal(cancelledAt, job.CompletedAt);
        Assert.Equal(cancelledAt, job.UpdatedAt);
        Assert.Null(job.LockedBy);
        Assert.Null(job.LockedAt);
    }

    [Fact]
    public void Cancel_WithCompletedJob_ShouldThrowInvalidOperationException()
    {
        // Arrange
        var job = CreateTestJob();
        var workerId = "worker-1";
        var claimedAt = DateTime.UtcNow;
        var completedAt = claimedAt.AddMinutes(5);
        var cancelledAt = completedAt.AddMinutes(5);

        job.TryClaim(workerId, claimedAt);
        job.MarkAsCompleted(completedAt);

        // Act & Assert
        Assert.Throws<InvalidOperationException>(() => job.Cancel(cancelledAt));
    }

    [Fact]
    public void Cancel_WithDeadJob_ShouldThrowInvalidOperationException()
    {
        // Arrange
        var job = CreateTestJob();
        var cancelledAt = DateTime.UtcNow;

        // First cancellation should succeed
        job.Cancel(cancelledAt);

        // Act & Assert - Second cancellation should fail
        Assert.Throws<InvalidOperationException>(() => job.Cancel(cancelledAt.AddMinutes(1)));
    }

    private static ThumbnailJob CreateTestJob()
    {
        return ThumbnailJob.Create(
            1, 
            "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
            DateTime.UtcNow);
    }
}