using Application.Abstractions.Messaging;
using Application.Abstractions.Services;
using Application.EventHandlers;
using Application.Extraction.Jobs;
using Application.Settings;
using Domain.Events;
using Domain.Models;
using Microsoft.Extensions.Logging;
using Moq;
using SharedKernel;
using Xunit;

namespace Application.Tests.EventHandlers;

public class ModelUploadedEventHandlerTests
{
    private static Mock<ISettingsService> SettingsServiceMock(bool generateOnUpload)
    {
        var settings = ApplicationSettings.CreateDefault(DateTime.UtcNow);
        if (!generateOnUpload)
        {
            // CreateDefault enables uploads by default; flip via the domain setter.
            settings.UpdateThumbnailSettings(
                frameCount: settings.ThumbnailFrameCount,
                size: settings.ThumbnailSize,
                generateOnUpload: false,
                generateAnimated: settings.GenerateAnimatedThumbnail,
                updatedAt: DateTime.UtcNow);
        }

        var mock = new Mock<ISettingsService>();
        mock.Setup(s => s.GetSettingsAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(settings);
        return mock;
    }

    private static Mock<ICommandHandler<EnqueueExtractionJobCommand, EnqueueExtractionJobResponse>> ExtractionHandlerMock()
    {
        var mock = new Mock<ICommandHandler<EnqueueExtractionJobCommand, EnqueueExtractionJobResponse>>();
        mock.Setup(h => h.Handle(It.IsAny<EnqueueExtractionJobCommand>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(new EnqueueExtractionJobResponse(77, AlreadyQueued: false)));
        return mock;
    }

    [Fact]
    public async Task Handle_ValidEvent_EnqueuesJob()
    {
        // Arrange
        var mockThumbnailQueue = new Mock<IThumbnailQueue>();
        var mockSettings = SettingsServiceMock(generateOnUpload: true);
        var mockExtraction = ExtractionHandlerMock();
        var mockLogger = new Mock<ILogger<ModelUploadedEventHandler>>();

        // Use a valid 64-character SHA256 hash
        var validHash = "a".PadRight(64, 'b'); // Valid SHA256 hash format (64 characters)
        var job = ThumbnailJob.Create(1, 10, validHash, DateTime.UtcNow);
        mockThumbnailQueue.Setup(x => x.EnqueueAsync(
                It.IsAny<int>(),
                It.IsAny<int>(),
                It.IsAny<string>(),
                It.IsAny<bool>(),
                It.IsAny<int>(),
                It.IsAny<int>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(job);

        var handler = new ModelUploadedEventHandler(mockThumbnailQueue.Object, mockSettings.Object, mockExtraction.Object, mockLogger.Object);
        var domainEvent = new ModelUploadedEvent(1, 10, validHash, true);

        // Act
        var result = await handler.Handle(domainEvent, CancellationToken.None);

        // Assert
        Assert.True(result.IsSuccess);
        mockThumbnailQueue.Verify(x => x.EnqueueAsync(
            1,
            10,
            validHash,
            It.IsAny<bool>(),
            It.IsAny<int>(),
            It.IsAny<int>(),
            CancellationToken.None), Times.Once);

        // And indexing is queued alongside it, not behind it. Scene-graph extraction used
        // to ride on the thumbnail render, so becoming searchable sat at the back of the
        // thumbnail queue - which on a 1,700-model import is hours of waiting for a walk
        // over a scene graph that takes milliseconds.
        mockExtraction.Verify(h => h.Handle(
            It.Is<EnqueueExtractionJobCommand>(c =>
                c.AssetId == 1 && c.VersionId == 10 &&
                c.ExtractorFamily == ExtractorFamilies.Geometry),
            It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_GenerateThumbnailOnUploadDisabled_SkipsThumbnailButStillIndexes()
    {
        // Arrange
        var mockThumbnailQueue = new Mock<IThumbnailQueue>();
        var mockSettings = SettingsServiceMock(generateOnUpload: false);
        var mockExtraction = ExtractionHandlerMock();
        var mockLogger = new Mock<ILogger<ModelUploadedEventHandler>>();

        var validHash = "a".PadRight(64, 'b');
        var handler = new ModelUploadedEventHandler(mockThumbnailQueue.Object, mockSettings.Object, mockExtraction.Object, mockLogger.Object);
        var domainEvent = new ModelUploadedEvent(1, 10, validHash, true);

        // Act
        var result = await handler.Handle(domainEvent, CancellationToken.None);

        // Assert - handler reports success (the upload itself is not failed),
        // no thumbnail job is enqueued, and the geometry extraction that would
        // otherwise have ridden along with the render is queued in its place.
        Assert.True(result.IsSuccess);
        mockThumbnailQueue.Verify(x => x.EnqueueAsync(
            It.IsAny<int>(),
            It.IsAny<int>(),
            It.IsAny<string>(),
            It.IsAny<bool>(),
            It.IsAny<int>(),
            It.IsAny<int>(),
            It.IsAny<CancellationToken>()), Times.Never);
        mockExtraction.Verify(h => h.Handle(
            It.Is<EnqueueExtractionJobCommand>(c =>
                c.AssetType == "Model" &&
                c.AssetId == 1 &&
                c.VersionId == 10 &&
                c.ExtractorFamily == ExtractorFamilies.Geometry &&
                c.FileSha256 == validHash),
            It.IsAny<CancellationToken>()), Times.Once);
    }

    /// <summary>
    /// The store-import path: the caller attaches the store's own turntable, so no
    /// thumbnail job is queued - and before this, nothing else queued the geometry
    /// extraction either, so an imported model was never indexed and could not be
    /// found by search.
    /// </summary>
    [Fact]
    public async Task Handle_CallerSuppliedThumbnail_StillQueuesGeometryExtraction()
    {
        // Arrange
        var mockThumbnailQueue = new Mock<IThumbnailQueue>();
        var mockSettings = SettingsServiceMock(generateOnUpload: true);
        var mockExtraction = ExtractionHandlerMock();
        var mockLogger = new Mock<ILogger<ModelUploadedEventHandler>>();

        var validHash = "a".PadRight(64, 'b');
        var handler = new ModelUploadedEventHandler(mockThumbnailQueue.Object, mockSettings.Object, mockExtraction.Object, mockLogger.Object);
        var domainEvent = new ModelUploadedEvent(1, 10, validHash, true, generateThumbnail: false);

        // Act
        var result = await handler.Handle(domainEvent, CancellationToken.None);

        // Assert
        Assert.True(result.IsSuccess);
        mockThumbnailQueue.Verify(x => x.EnqueueAsync(
            It.IsAny<int>(),
            It.IsAny<int>(),
            It.IsAny<string>(),
            It.IsAny<bool>(),
            It.IsAny<int>(),
            It.IsAny<int>(),
            It.IsAny<CancellationToken>()), Times.Never);
        mockExtraction.Verify(h => h.Handle(
            It.Is<EnqueueExtractionJobCommand>(c =>
                c.AssetType == "Model" &&
                c.AssetId == 1 &&
                c.VersionId == 10 &&
                c.ExtractorFamily == ExtractorFamilies.Geometry),
            It.IsAny<CancellationToken>()), Times.Once);
    }

    /// <summary>
    /// A failed extraction enqueue must not fail the event: the upload is already
    /// durable and the asset is usable un-indexed. It is logged and recoverable with
    /// trigger_rederive.
    /// </summary>
    [Fact]
    public async Task Handle_ExtractionEnqueueFails_StillReportsSuccess()
    {
        // Arrange
        var mockThumbnailQueue = new Mock<IThumbnailQueue>();
        var mockSettings = SettingsServiceMock(generateOnUpload: true);
        var mockExtraction = new Mock<ICommandHandler<EnqueueExtractionJobCommand, EnqueueExtractionJobResponse>>();
        mockExtraction.Setup(h => h.Handle(It.IsAny<EnqueueExtractionJobCommand>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Failure<EnqueueExtractionJobResponse>(
                new Error("ModelVersionNotFound", "Model 1 has no version to re-derive.")));
        var mockLogger = new Mock<ILogger<ModelUploadedEventHandler>>();

        var validHash = "a".PadRight(64, 'b');
        var handler = new ModelUploadedEventHandler(mockThumbnailQueue.Object, mockSettings.Object, mockExtraction.Object, mockLogger.Object);
        var domainEvent = new ModelUploadedEvent(1, 10, validHash, true, generateThumbnail: false);

        // Act
        var result = await handler.Handle(domainEvent, CancellationToken.None);

        // Assert
        Assert.True(result.IsSuccess);
    }

    [Fact]
    public async Task Handle_EnqueueThrowsException_ReturnsFailure()
    {
        // Arrange
        var mockThumbnailQueue = new Mock<IThumbnailQueue>();
        var mockSettings = SettingsServiceMock(generateOnUpload: true);
        var mockExtraction = ExtractionHandlerMock();
        var mockLogger = new Mock<ILogger<ModelUploadedEventHandler>>();

        mockThumbnailQueue.Setup(x => x.EnqueueAsync(
                It.IsAny<int>(),
                It.IsAny<int>(),
                It.IsAny<string>(),
                It.IsAny<bool>(),
                It.IsAny<int>(),
                It.IsAny<int>(),
                It.IsAny<CancellationToken>()))
            .ThrowsAsync(new Exception("Test exception"));

        var handler = new ModelUploadedEventHandler(mockThumbnailQueue.Object, mockSettings.Object, mockExtraction.Object, mockLogger.Object);
        var domainEvent = new ModelUploadedEvent(1, 10, "test-hash", true);

        // Act
        var result = await handler.Handle(domainEvent, CancellationToken.None);

        // Assert
        Assert.False(result.IsSuccess);
        Assert.Contains("Failed to enqueue thumbnail job", result.Error.Message);
    }
}
