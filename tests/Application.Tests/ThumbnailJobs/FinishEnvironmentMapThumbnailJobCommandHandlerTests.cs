using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Application.Tests;
using Application.ThumbnailJobs;
using Domain.Models;
using Domain.Services;
using Microsoft.Extensions.Logging;
using Moq;
using SharedKernel;
using Xunit;

namespace Application.Tests.ThumbnailJobs;

public class FinishEnvironmentMapThumbnailJobCommandHandlerTests
{
    private readonly Mock<IThumbnailJobRepository> _thumbnailJobRepository = new();
    private readonly Mock<IEnvironmentMapRepository> _environmentMapRepository = new();
    private readonly Mock<IThumbnailQueue> _thumbnailQueue = new();
    private readonly Mock<IDateTimeProvider> _dateTimeProvider = new();
    private readonly Mock<IThumbnailNotificationService> _thumbnailNotificationService = new();
    private readonly Mock<ILogger<FinishEnvironmentMapThumbnailJobCommandHandler>> _logger = new();

    [Fact]
    public async Task Handle_WhenSuccess_UpdatesVariantThumbnailPathAndCompletesJob()
    {
        var now = DateTime.UtcNow;
        _dateTimeProvider.Setup(x => x.UtcNow).Returns(now);
        _thumbnailNotificationService
            .Setup(x => x.SendEnvironmentMapThumbnailStatusChangedAsync(It.IsAny<EnvironmentMapThumbnailStatusChangedNotification>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);

        var environmentMap = EnvironmentMap.Create("Studio", now.AddMinutes(-5)).WithId(11);
        var variant = EnvironmentMapVariant.Create(CreateFile(now).WithId(21), "4K", now.AddMinutes(-5)).WithId(31);
        environmentMap.AddVariant(variant, now.AddMinutes(-5));
        environmentMap.SetPreviewVariant(variant.Id, now.AddMinutes(-5));

        var job = ThumbnailJob.CreateForEnvironmentMap(environmentMap.Id, variant.Id, now.AddMinutes(-1)).WithId(41);

        _thumbnailJobRepository.Setup(x => x.GetByIdAsync(job.Id, It.IsAny<CancellationToken>())).ReturnsAsync(job);
        _environmentMapRepository.Setup(x => x.GetByIdAsync(environmentMap.Id, It.IsAny<CancellationToken>())).ReturnsAsync(environmentMap);
        _environmentMapRepository.Setup(x => x.UpdateAsync(environmentMap, It.IsAny<CancellationToken>())).ReturnsAsync(environmentMap);

        var handler = new FinishEnvironmentMapThumbnailJobCommandHandler(
            _thumbnailJobRepository.Object,
            _environmentMapRepository.Object,
            _thumbnailQueue.Object,
            _dateTimeProvider.Object,
            _thumbnailNotificationService.Object,
            _logger.Object);

        var result = await handler.Handle(new FinishEnvironmentMapThumbnailJobCommand(job.Id, true, "previews/environment-maps/11/31.webp"), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal("previews/environment-maps/11/31.webp", variant.ThumbnailPath);
        _environmentMapRepository.Verify(x => x.UpdateAsync(environmentMap, It.IsAny<CancellationToken>()), Times.Once);
        _thumbnailQueue.Verify(x => x.MarkCompletedAsync(job.Id, It.IsAny<CancellationToken>()), Times.Once);
        _thumbnailNotificationService.Verify(x => x.SendEnvironmentMapThumbnailStatusChangedAsync(
            It.Is<EnvironmentMapThumbnailStatusChangedNotification>(notification =>
                notification.EnvironmentMapId == environmentMap.Id &&
                notification.EnvironmentMapVariantId == variant.Id &&
                notification.Status == "Ready" &&
                notification.PreviewUrl == $"/environment-maps/{environmentMap.Id}/preview?v={now.Ticks}" &&
                notification.VariantPreviewUrl == $"/environment-maps/{environmentMap.Id}/variants/{variant.Id}/preview?v={now.Ticks}" &&
                notification.Timestamp == now &&
                notification.ErrorMessage == null),
            It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_WhenFailure_ClearsVariantThumbnailPathAndMarksJobFailed()
    {
        var now = DateTime.UtcNow;
        _dateTimeProvider.Setup(x => x.UtcNow).Returns(now);
        _thumbnailNotificationService
            .Setup(x => x.SendEnvironmentMapThumbnailStatusChangedAsync(It.IsAny<EnvironmentMapThumbnailStatusChangedNotification>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);

        var environmentMap = EnvironmentMap.Create("Studio", now.AddMinutes(-5)).WithId(11);
        var variant = EnvironmentMapVariant.Create(CreateFile(now).WithId(21), "4K", now.AddMinutes(-5)).WithId(31);
        variant.SetThumbnailPath("old.webp", now.AddMinutes(-2));
        environmentMap.AddVariant(variant, now.AddMinutes(-5));
        var job = ThumbnailJob.CreateForEnvironmentMap(environmentMap.Id, variant.Id, now.AddMinutes(-1)).WithId(41);

        _thumbnailJobRepository.Setup(x => x.GetByIdAsync(job.Id, It.IsAny<CancellationToken>())).ReturnsAsync(job);
        _environmentMapRepository.Setup(x => x.GetByIdAsync(environmentMap.Id, It.IsAny<CancellationToken>())).ReturnsAsync(environmentMap);
        _environmentMapRepository.Setup(x => x.UpdateAsync(environmentMap, It.IsAny<CancellationToken>())).ReturnsAsync(environmentMap);

        var handler = new FinishEnvironmentMapThumbnailJobCommandHandler(
            _thumbnailJobRepository.Object,
            _environmentMapRepository.Object,
            _thumbnailQueue.Object,
            _dateTimeProvider.Object,
            _thumbnailNotificationService.Object,
            _logger.Object);

        var result = await handler.Handle(new FinishEnvironmentMapThumbnailJobCommand(job.Id, false, ErrorMessage: "renderer failed"), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Null(variant.ThumbnailPath);
        _thumbnailQueue.Verify(x => x.MarkFailedAsync(job.Id, "renderer failed", It.IsAny<CancellationToken>()), Times.Once);
        _thumbnailNotificationService.Verify(x => x.SendEnvironmentMapThumbnailStatusChangedAsync(
            It.Is<EnvironmentMapThumbnailStatusChangedNotification>(notification =>
                notification.EnvironmentMapId == environmentMap.Id &&
                notification.EnvironmentMapVariantId == variant.Id &&
                notification.Status == "Failed" &&
                notification.PreviewUrl == $"/environment-maps/{environmentMap.Id}/preview?v={now.Ticks}" &&
                notification.VariantPreviewUrl == $"/environment-maps/{environmentMap.Id}/variants/{variant.Id}/preview?v={now.Ticks}" &&
                notification.Timestamp == now &&
                notification.ErrorMessage == "renderer failed"),
            It.IsAny<CancellationToken>()), Times.Once);
    }

    private static Domain.Models.File CreateFile(DateTime createdAt)
        => Domain.Models.File.Create("studio.hdr", "studio.hdr", "uploads/studio.hdr", "image/vnd.radiance", Domain.ValueObjects.FileType.Hdr, 1024, $"{Guid.NewGuid():N}{Guid.NewGuid():N}"[..64], createdAt);
}
