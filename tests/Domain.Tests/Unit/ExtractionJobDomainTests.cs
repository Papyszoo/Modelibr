using Domain.Models;
using Domain.ValueObjects;
using Xunit;

namespace Domain.Tests.Unit;

public class ExtractionJobDomainTests
{
    private const string Family = "Geometry";
    private const string ValidHash = "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

    [Fact]
    public void Create_WithValidParameters_ShouldCreatePendingJob()
    {
        var createdAt = DateTime.UtcNow;

        var job = ExtractionJob.Create("Model", 1, Family, createdAt, versionId: 10, fileSha256: ValidHash);

        Assert.Equal("Model", job.AssetType);
        Assert.Equal(1, job.AssetId);
        Assert.Equal(10, job.VersionId);
        Assert.Equal(Family, job.ExtractorFamily);
        Assert.Equal(ValidHash, job.FileSha256);
        Assert.Equal(ExtractionJobStatus.Pending, job.Status);
        Assert.Equal(0, job.AttemptCount);
        Assert.Null(job.LockedBy);
        Assert.Null(job.CompletedAt);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    public void Create_WithInvalidAssetId_ShouldThrow(int invalidAssetId)
    {
        Assert.Throws<ArgumentException>(() =>
            ExtractionJob.Create("Model", invalidAssetId, Family, DateTime.UtcNow));
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Create_WithBlankExtractorFamily_ShouldThrow(string family)
    {
        Assert.Throws<ArgumentException>(() =>
            ExtractionJob.Create("Model", 1, family, DateTime.UtcNow));
    }

    [Theory]
    [InlineData("short")]
    [InlineData("   ")]
    public void Create_WithInvalidFileHash_ShouldThrow(string hash)
    {
        Assert.Throws<ArgumentException>(() =>
            ExtractionJob.Create("Model", 1, Family, DateTime.UtcNow, fileSha256: hash));
    }

    [Fact]
    public void Create_WithNullFileHash_IsAllowed()
    {
        var job = ExtractionJob.Create("Script", 3, "Script", DateTime.UtcNow, fileSha256: null);
        Assert.Null(job.FileSha256);
    }

    [Fact]
    public void TryClaim_WhenPending_ClaimsAndIncrementsAttempt()
    {
        var job = ExtractionJob.Create("Model", 1, Family, DateTime.UtcNow);

        var claimed = job.TryClaim("worker-a", DateTime.UtcNow);

        Assert.True(claimed);
        Assert.Equal(ExtractionJobStatus.Processing, job.Status);
        Assert.Equal("worker-a", job.LockedBy);
        Assert.Equal(1, job.AttemptCount);
    }

    [Fact]
    public void TryClaim_WhenLockedAndNotExpired_ByAnotherWorker_Fails()
    {
        var start = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        var job = ExtractionJob.Create("Model", 1, Family, start, lockTimeoutMinutes: 10);
        job.TryClaim("worker-a", start);

        var claimedAgain = job.TryClaim("worker-b", start.AddMinutes(5));

        Assert.False(claimedAgain);
        Assert.Equal("worker-a", job.LockedBy);
    }

    [Fact]
    public void TryClaim_WhenLockExpired_AllowsReclaim()
    {
        var start = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        var job = ExtractionJob.Create("Model", 1, Family, start, lockTimeoutMinutes: 10);
        job.TryClaim("worker-a", start);

        var reclaimed = job.TryClaim("worker-b", start.AddMinutes(11));

        Assert.True(reclaimed);
        Assert.Equal("worker-b", job.LockedBy);
        Assert.Equal(2, job.AttemptCount);
    }

    [Fact]
    public void MarkAsFailed_UnderMaxAttempts_ReturnsToPending()
    {
        var job = ExtractionJob.Create("Model", 1, Family, DateTime.UtcNow, maxAttempts: 3);
        job.TryClaim("worker-a", DateTime.UtcNow); // AttemptCount = 1

        job.MarkAsFailed("boom", DateTime.UtcNow);

        Assert.Equal(ExtractionJobStatus.Pending, job.Status);
        Assert.Equal("boom", job.ErrorMessage);
        Assert.Null(job.LockedBy);
    }

    [Fact]
    public void MarkAsFailed_AtMaxAttempts_MovesToDead()
    {
        var now = DateTime.UtcNow;
        var job = ExtractionJob.Create("Model", 1, Family, now, maxAttempts: 1);
        job.TryClaim("worker-a", now); // AttemptCount = 1 == MaxAttempts

        job.MarkAsFailed("fatal", now);

        Assert.Equal(ExtractionJobStatus.Dead, job.Status);
        Assert.NotNull(job.CompletedAt);
    }

    [Fact]
    public void TryClaim_WhenDead_Fails()
    {
        var now = DateTime.UtcNow;
        var job = ExtractionJob.Create("Model", 1, Family, now, maxAttempts: 1);
        job.TryClaim("worker-a", now);
        job.MarkAsFailed("fatal", now);

        Assert.False(job.TryClaim("worker-b", now.AddHours(1)));
    }

    [Fact]
    public void MarkAsCompleted_WithWarningDetail_KeepsPartialSuccessInfo()
    {
        var job = ExtractionJob.Create("Model", 1, Family, DateTime.UtcNow);
        job.TryClaim("worker-a", DateTime.UtcNow);

        job.MarkAsCompleted(DateTime.UtcNow, "2 images failed to resolve");

        Assert.Equal(ExtractionJobStatus.Done, job.Status);
        Assert.Equal("2 images failed to resolve", job.WarningDetail);
        Assert.Null(job.ErrorMessage);
        Assert.Null(job.LockedBy);
    }

    [Fact]
    public void IsLockExpired_ReflectsTimeout()
    {
        var start = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        var job = ExtractionJob.Create("Model", 1, Family, start, lockTimeoutMinutes: 10);
        job.TryClaim("worker-a", start);

        Assert.False(job.IsLockExpired(start.AddMinutes(9)));
        Assert.True(job.IsLockExpired(start.AddMinutes(10)));
    }

    [Fact]
    public void Reset_ReturnsJobToPristinePending()
    {
        var now = DateTime.UtcNow;
        var job = ExtractionJob.Create("Model", 1, Family, now);
        job.TryClaim("worker-a", now);
        job.MarkAsCompleted(now, "warn");

        job.Reset(now.AddMinutes(1));

        Assert.Equal(ExtractionJobStatus.Pending, job.Status);
        Assert.Equal(0, job.AttemptCount);
        Assert.Null(job.WarningDetail);
        Assert.Null(job.CompletedAt);
    }

    [Fact]
    public void CreateOperation_CarriesTheOperationAndItsParameters()
    {
        var job = ExtractionJob.CreateOperation(
            "Model", 7, "Blender", "uv-unwrap", DateTime.UtcNow,
            parametersJson: "{\"method\":\"smart\"}", versionId: 12);

        Assert.Equal("uv-unwrap", job.Operation);
        Assert.Equal("{\"method\":\"smart\"}", job.ParametersJson);
        Assert.Equal("Blender", job.ExtractorFamily);
        Assert.Equal(12, job.VersionId);
        Assert.Null(job.ResultJson);
    }

    [Fact]
    public void Create_LeavesTheOperationFieldsUnset()
    {
        // A re-derive is not an operation, and nothing downstream should have to
        // distinguish "no operation" from "an operation named nothing".
        var job = ExtractionJob.Create("Model", 7, Family, DateTime.UtcNow);

        Assert.Null(job.Operation);
        Assert.Null(job.ParametersJson);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void CreateOperation_RejectsAnEmptyOperation(string operation)
    {
        Assert.Throws<ArgumentException>(() => ExtractionJob.CreateOperation(
            "Model", 7, "Blender", operation, DateTime.UtcNow));
    }

    [Fact]
    public void CreateOperation_RejectsParametersTooLargeToStore()
    {
        Assert.Throws<ArgumentException>(() => ExtractionJob.CreateOperation(
            "Model", 7, "Blender", "uv-unwrap", DateTime.UtcNow,
            parametersJson: new string('x', 4001)));
    }

    [Fact]
    public void MarkAsCompleted_RecordsWhatTheOperationProduced()
    {
        var job = ExtractionJob.CreateOperation("Model", 7, "Blender", "uv-unwrap", DateTime.UtcNow);
        job.TryClaim("worker-a", DateTime.UtcNow);

        job.MarkAsCompleted(DateTime.UtcNow, resultJson: "{\"versionId\":13}");

        Assert.Equal(ExtractionJobStatus.Done, job.Status);
        Assert.Equal("{\"versionId\":13}", job.ResultJson);
    }

    [Fact]
    public void MarkAsCompleted_WithoutAResult_LeavesAnEarlierOneAlone()
    {
        // A re-derive finishing normally passes no result, and must not blank the field
        // for the operation path that shares this entity.
        var job = ExtractionJob.CreateOperation("Model", 7, "Blender", "uv-unwrap", DateTime.UtcNow);
        job.TryClaim("worker-a", DateTime.UtcNow);
        job.MarkAsCompleted(DateTime.UtcNow, resultJson: "{\"versionId\":13}");

        job.MarkAsCompleted(DateTime.UtcNow);

        Assert.Equal("{\"versionId\":13}", job.ResultJson);
    }
}
