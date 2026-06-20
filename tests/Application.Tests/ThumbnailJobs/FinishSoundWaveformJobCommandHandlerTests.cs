using Application.Abstractions.Repositories;
using Application.Tests;
using Application.ThumbnailJobs;
using Domain.Models;
using Domain.Services;
using Domain.ValueObjects;
using Microsoft.Extensions.Logging;
using Moq;
using Xunit;
using DomainFile = Domain.Models.File;

namespace Application.Tests.ThumbnailJobs;

public class FinishSoundWaveformJobCommandHandlerTests
{
    private readonly Mock<IThumbnailJobRepository> _thumbnailJobRepository = new();
    private readonly Mock<ISoundRepository> _soundRepository = new();
    private readonly Mock<IDateTimeProvider> _dateTimeProvider = new();
    private readonly Mock<ILogger<FinishSoundWaveformJobCommandHandler>> _logger = new();

    [Fact]
    public async Task Handle_WhenSuccess_PersistsAudioMetadataOnTheSound()
    {
        var now = DateTime.UtcNow;
        _dateTimeProvider.Setup(x => x.UtcNow).Returns(now);

        var sound = Sound.Create("clip", CreateAudioFile(), duration: 0, peaks: null, now.AddMinutes(-5)).WithId(7);
        var job = ThumbnailJob.CreateForSound(7, "soundhash", now.AddMinutes(-1)).WithId(41);

        _thumbnailJobRepository.Setup(x => x.GetByIdAsync(job.Id, It.IsAny<CancellationToken>())).ReturnsAsync(job);
        _soundRepository.Setup(x => x.GetByIdAsync(7, It.IsAny<CancellationToken>())).ReturnsAsync(sound);
        _soundRepository.Setup(x => x.UpdateAsync(sound, It.IsAny<CancellationToken>())).ReturnsAsync(sound);

        var handler = new FinishSoundWaveformJobCommandHandler(
            _thumbnailJobRepository.Object,
            _soundRepository.Object,
            _dateTimeProvider.Object,
            _logger.Object);

        var result = await handler.Handle(
            new FinishSoundWaveformJobCommand(job.Id, true, "waveforms/soundhash/waveform.png", 1234, 9.5, 48000, 2, "wav", null),
            CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(9.5, sound.Duration);
        Assert.Equal(48000, sound.SampleRate);
        Assert.Equal(2, sound.Channels);
        Assert.Equal("wav", sound.Format);
        _soundRepository.Verify(x => x.UpdateAsync(sound, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_WhenSuccessButSoundMissing_StillCompletesJob()
    {
        var now = DateTime.UtcNow;
        _dateTimeProvider.Setup(x => x.UtcNow).Returns(now);

        var job = ThumbnailJob.CreateForSound(99, "soundhash", now.AddMinutes(-1)).WithId(42);
        _thumbnailJobRepository.Setup(x => x.GetByIdAsync(job.Id, It.IsAny<CancellationToken>())).ReturnsAsync(job);
        _soundRepository.Setup(x => x.GetByIdAsync(99, It.IsAny<CancellationToken>())).ReturnsAsync((Sound?)null);

        var handler = new FinishSoundWaveformJobCommandHandler(
            _thumbnailJobRepository.Object,
            _soundRepository.Object,
            _dateTimeProvider.Object,
            _logger.Object);

        var result = await handler.Handle(
            new FinishSoundWaveformJobCommand(job.Id, true, "waveforms/soundhash/waveform.png", 1234, 9.5, 48000, 2, "wav", null),
            CancellationToken.None);

        Assert.True(result.IsSuccess);
        _soundRepository.Verify(x => x.UpdateAsync(It.IsAny<Sound>(), It.IsAny<CancellationToken>()), Times.Never);
        _thumbnailJobRepository.Verify(x => x.UpdateAsync(job, It.IsAny<CancellationToken>()), Times.Once);
    }

    private static DomainFile CreateAudioFile()
        => DomainFile.Create("clip.wav", "clip.wav", "uploads/clip.wav", "audio/wav", FileType.Wav, 88200, $"{Guid.NewGuid():N}{Guid.NewGuid():N}"[..64], DateTime.UtcNow);
}
