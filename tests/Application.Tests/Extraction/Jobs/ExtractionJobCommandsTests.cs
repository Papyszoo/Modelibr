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

    // ---- Enqueue ----------------------------------------------------------------

    [Fact]
    public async Task Enqueue_When_NoLiveJob_Creates_And_Persists()
    {
        var repo = new Mock<IExtractionJobRepository>();
        repo.Setup(r => r.GetLiveJobAsync("Model", 42, 1, ExtractorFamilies.Geometry, It.IsAny<CancellationToken>()))
            .ReturnsAsync((ExtractionJob?)null);
        var uow = new Mock<IUnitOfWork>();

        var handler = new EnqueueExtractionJobCommandHandler(repo.Object, Clock().Object, uow.Object);
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

        var handler = new EnqueueExtractionJobCommandHandler(repo.Object, Clock().Object, uow.Object);
        var result = await handler.Handle(
            new EnqueueExtractionJobCommand("Model", 42, VersionId: 1), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.True(result.Value.AlreadyQueued);
        repo.Verify(r => r.AddAsync(It.IsAny<ExtractionJob>(), It.IsAny<CancellationToken>()), Times.Never);
        uow.Verify(u => u.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Never);
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
        var result = await handler.Handle(new FinishExtractionJobCommand(job.Id, Success: true), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(Domain.ValueObjects.ExtractionJobStatus.Done, job.Status);
        uow.Verify(u => u.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Finish_NotFound_Fails()
    {
        var repo = new Mock<IExtractionJobRepository>();
        repo.Setup(r => r.GetByIdAsync(99, It.IsAny<CancellationToken>())).ReturnsAsync((ExtractionJob?)null);

        var handler = new FinishExtractionJobCommandHandler(repo.Object, Clock().Object, new Mock<IUnitOfWork>().Object);
        var result = await handler.Handle(new FinishExtractionJobCommand(99, Success: true), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("ExtractionJobNotFound", result.Error.Code);
    }

    private static NullLogger<DequeueExtractionJobCommandHandler> NullLogger() =>
        NullLogger<DequeueExtractionJobCommandHandler>.Instance;
}
