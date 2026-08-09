using Application.Abstractions;
using Application.Abstractions.Repositories;
using Application.Extraction.Jobs;
using Domain.Models;
using Domain.Services;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace Application.Tests.Extraction.Jobs;

public class ExtractionJobCommandsTests
{
    private static readonly DateTime Now = new(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);

    private static Mock<IDateTimeProvider> Clock()
    {
        var clock = new Mock<IDateTimeProvider>();
        clock.Setup(c => c.UtcNow).Returns(Now);
        return clock;
    }

    /// <summary>Model 42 has one version, id 1 — the version an omitted VersionId resolves to.</summary>
    private static Mock<IModelVersionRepository> Versions()
    {
        var versions = new Mock<IModelVersionRepository>();
        versions.Setup(v => v.GetByModelIdAsync(42, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { ModelVersionFake(1, 1) });
        return versions;
    }

    private static ModelVersion ModelVersionFake(int id, int versionNumber)
    {
        var version = ModelVersion.Create(42, versionNumber, null, Now);
        typeof(ModelVersion).GetProperty(nameof(ModelVersion.Id))!.SetValue(version, id);
        return version;
    }

    // ---- Enqueue ----------------------------------------------------------------

    [Fact]
    public async Task Enqueue_When_NoLiveJob_Creates_And_Persists()
    {
        var repo = new Mock<IExtractionJobRepository>();
        repo.Setup(r => r.GetLiveJobAsync("Model", 42, 1, ExtractorFamilies.Geometry, It.IsAny<CancellationToken>()))
            .ReturnsAsync((ExtractionJob?)null);
        var uow = new Mock<IUnitOfWork>();

        var handler = new EnqueueExtractionJobCommandHandler(repo.Object, Versions().Object, Clock().Object, uow.Object);
        var result = await handler.Handle(
            new EnqueueExtractionJobCommand("Model", 42, VersionId: 1), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.False(result.Value.AlreadyQueued);
        repo.Verify(r => r.AddAsync(It.Is<ExtractionJob>(j => j.AssetId == 42 && j.VersionId == 1), It.IsAny<CancellationToken>()), Times.Once);
        uow.Verify(u => u.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Enqueue_When_LiveJobExists_Is_Noop_And_Returns_Existing()
    {
        var existing = ExtractionJob.Create("Model", 42, ExtractorFamilies.Geometry, Now, versionId: 1);
        var repo = new Mock<IExtractionJobRepository>();
        repo.Setup(r => r.GetLiveJobAsync("Model", 42, 1, ExtractorFamilies.Geometry, It.IsAny<CancellationToken>()))
            .ReturnsAsync(existing);
        var uow = new Mock<IUnitOfWork>();

        var handler = new EnqueueExtractionJobCommandHandler(repo.Object, Versions().Object, Clock().Object, uow.Object);
        var result = await handler.Handle(
            new EnqueueExtractionJobCommand("Model", 42, VersionId: 1), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.True(result.Value.AlreadyQueued);
        repo.Verify(r => r.AddAsync(It.IsAny<ExtractionJob>(), It.IsAny<CancellationToken>()), Times.Never);
        uow.Verify(u => u.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Enqueue_Model_Without_VersionId_Resolves_The_Current_Version()
    {
        // Regression: trigger_rederive omits versionId for a model, and the job used to
        // be queued with a null one. The worker then downloaded the file, extracted it,
        // failed BOTH save calls with a 400 ("modelVersionId": null) and still reported
        // the job completed — so re-deriving 1,717 models reported success while not one
        // search document changed.
        var repo = new Mock<IExtractionJobRepository>();
        repo.Setup(r => r.GetLiveJobAsync("Model", 42, 1, ExtractorFamilies.Geometry, It.IsAny<CancellationToken>()))
            .ReturnsAsync((ExtractionJob?)null);
        var uow = new Mock<IUnitOfWork>();

        var handler = new EnqueueExtractionJobCommandHandler(repo.Object, Versions().Object, Clock().Object, uow.Object);
        var result = await handler.Handle(
            new EnqueueExtractionJobCommand("Model", 42), CancellationToken.None);

        Assert.True(result.IsSuccess);
        repo.Verify(
            r => r.AddAsync(It.Is<ExtractionJob>(j => j.VersionId == 1), It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task Enqueue_Model_With_No_Versions_Fails_Instead_Of_Queueing_A_Useless_Job()
    {
        var repo = new Mock<IExtractionJobRepository>();
        var uow = new Mock<IUnitOfWork>();
        var versions = new Mock<IModelVersionRepository>();
        versions.Setup(v => v.GetByModelIdAsync(99, It.IsAny<CancellationToken>()))
            .ReturnsAsync(Array.Empty<ModelVersion>());

        var handler = new EnqueueExtractionJobCommandHandler(repo.Object, versions.Object, Clock().Object, uow.Object);
        var result = await handler.Handle(
            new EnqueueExtractionJobCommand("Model", 99), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("ModelVersionNotFound", result.Error.Code);
        repo.Verify(r => r.AddAsync(It.IsAny<ExtractionJob>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    // ---- Dequeue ----------------------------------------------------------------

    [Fact]
    public async Task Dequeue_Claims_And_Returns_The_Job()
    {
        var candidate = ExtractionJob.Create("Model", 42, ExtractorFamilies.Geometry, Now, versionId: 1, fileSha256: new string('a', 64));
        var repo = new Mock<IExtractionJobRepository>();
        repo.Setup(r => r.GetNextClaimableJobAsync(ExtractorFamilies.Geometry, Now, It.IsAny<CancellationToken>()))
            .ReturnsAsync(candidate);
        repo.Setup(r => r.TryClaimJobAsync(candidate.Id, "w1", Now, It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
        repo.Setup(r => r.GetByIdAsync(candidate.Id, It.IsAny<CancellationToken>()))
            .ReturnsAsync(candidate);

        var handler = new DequeueExtractionJobCommandHandler(repo.Object, Clock().Object, NullLogger());
        var result = await handler.Handle(new DequeueExtractionJobCommand("w1"), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.NotNull(result.Value.Job);
        Assert.Equal("Model", result.Value.Job!.AssetType);
        Assert.Equal(42, result.Value.Job.AssetId);
    }

    [Fact]
    public async Task Dequeue_When_Empty_Returns_Null()
    {
        var repo = new Mock<IExtractionJobRepository>();
        repo.Setup(r => r.GetNextClaimableJobAsync(ExtractorFamilies.Geometry, Now, It.IsAny<CancellationToken>()))
            .ReturnsAsync((ExtractionJob?)null);

        var handler = new DequeueExtractionJobCommandHandler(repo.Object, Clock().Object, NullLogger());
        var result = await handler.Handle(new DequeueExtractionJobCommand("w1"), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Null(result.Value.Job);
    }

    [Fact]
    public async Task Dequeue_Retries_Next_When_Claim_Lost_To_Race()
    {
        var first = ExtractionJob.Create("Model", 1, ExtractorFamilies.Geometry, Now);
        var second = ExtractionJob.Create("Model", 2, ExtractorFamilies.Geometry, Now);
        var repo = new Mock<IExtractionJobRepository>();
        repo.SetupSequence(r => r.GetNextClaimableJobAsync(ExtractorFamilies.Geometry, Now, It.IsAny<CancellationToken>()))
            .ReturnsAsync(first)
            .ReturnsAsync(second);
        repo.Setup(r => r.TryClaimJobAsync(first.Id, "w1", Now, It.IsAny<CancellationToken>())).ReturnsAsync(false); // lost
        repo.Setup(r => r.TryClaimJobAsync(second.Id, "w1", Now, It.IsAny<CancellationToken>())).ReturnsAsync(true);  // won
        repo.Setup(r => r.GetByIdAsync(second.Id, It.IsAny<CancellationToken>())).ReturnsAsync(second);

        var handler = new DequeueExtractionJobCommandHandler(repo.Object, Clock().Object, NullLogger());
        var result = await handler.Handle(new DequeueExtractionJobCommand("w1"), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(2, result.Value.Job!.AssetId);
    }

    // ---- Finish -----------------------------------------------------------------

    [Fact]
    public async Task Finish_Success_Marks_Done_And_Saves()
    {
        var job = ExtractionJob.Create("Model", 42, ExtractorFamilies.Geometry, Now);
        job.TryClaim("w1", Now);
        var repo = new Mock<IExtractionJobRepository>();
        repo.Setup(r => r.GetByIdAsync(job.Id, It.IsAny<CancellationToken>())).ReturnsAsync(job);
        var uow = new Mock<IUnitOfWork>();

        var handler = new FinishExtractionJobCommandHandler(repo.Object, Clock().Object, uow.Object);
        var result = await handler.Handle(
            new FinishExtractionJobCommand(job.Id, "w1", Success: true), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(Domain.ValueObjects.ExtractionJobStatus.Done, job.Status);
        uow.Verify(u => u.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Finish_From_A_Worker_That_No_Longer_Holds_The_Claim_Is_Rejected()
    {
        // Regression: an expired lease let another worker re-claim the job. Without an
        // ownership check the original worker could come back and overwrite the newer
        // run's outcome — marking Done a job the current owner never finished.
        var job = ExtractionJob.Create("Model", 42, ExtractorFamilies.Geometry, Now);
        job.TryClaim("w1", Now);
        job.MarkAsFailed("lease expired", Now);   // released back to the queue
        job.TryClaim("w2", Now);                  // re-claimed by a different worker
        var repo = new Mock<IExtractionJobRepository>();
        repo.Setup(r => r.GetByIdAsync(job.Id, It.IsAny<CancellationToken>())).ReturnsAsync(job);
        var uow = new Mock<IUnitOfWork>();

        var handler = new FinishExtractionJobCommandHandler(repo.Object, Clock().Object, uow.Object);
        var result = await handler.Handle(
            new FinishExtractionJobCommand(job.Id, "w1", Success: true), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("ExtractionJobLeaseLost", result.Error.Code);
        Assert.Equal(Domain.ValueObjects.ExtractionJobStatus.Processing, job.Status);
        uow.Verify(u => u.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Finish_On_An_Unclaimed_Job_Is_Rejected()
    {
        var job = ExtractionJob.Create("Model", 42, ExtractorFamilies.Geometry, Now);
        var repo = new Mock<IExtractionJobRepository>();
        repo.Setup(r => r.GetByIdAsync(job.Id, It.IsAny<CancellationToken>())).ReturnsAsync(job);
        var uow = new Mock<IUnitOfWork>();

        var handler = new FinishExtractionJobCommandHandler(repo.Object, Clock().Object, uow.Object);
        var result = await handler.Handle(
            new FinishExtractionJobCommand(job.Id, "w1", Success: true), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("ExtractionJobNotClaimed", result.Error.Code);
        uow.Verify(u => u.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Finish_NotFound_Fails()
    {
        var repo = new Mock<IExtractionJobRepository>();
        repo.Setup(r => r.GetByIdAsync(99, It.IsAny<CancellationToken>())).ReturnsAsync((ExtractionJob?)null);

        var handler = new FinishExtractionJobCommandHandler(repo.Object, Clock().Object, new Mock<IUnitOfWork>().Object);
        var result = await handler.Handle(
            new FinishExtractionJobCommand(99, "w1", Success: true), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("ExtractionJobNotFound", result.Error.Code);
    }

    private static NullLogger<DequeueExtractionJobCommandHandler> NullLogger() =>
        NullLogger<DequeueExtractionJobCommandHandler>.Instance;
}
