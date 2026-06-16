using Domain.Models;
using Domain.ValueObjects;
using Xunit;
using DomainFile = Domain.Models.File;

namespace Domain.Tests.Unit;

public class SoundDomainTests
{
    [Fact]
    public void UpdateAudioMetadata_WithValidValues_StoresFieldsAndAuthoritativeDuration()
    {
        // Arrange — sounds are frequently created with duration 0 before the
        // worker has analyzed the file.
        var sound = Sound.Create("clip", CreateAudioFile(), duration: 0, peaks: null, DateTime.UtcNow);
        var updatedAt = DateTime.UtcNow.AddMinutes(1);

        // Act
        sound.UpdateAudioMetadata(48000, 2, "WAV", durationFromWorker: 12.5, updatedAt);

        // Assert
        Assert.Equal(48000, sound.SampleRate);
        Assert.Equal(2, sound.Channels);
        Assert.Equal("wav", sound.Format);
        Assert.Equal(12.5, sound.Duration); // worker duration is authoritative
        Assert.Equal(updatedAt, sound.UpdatedAt);
    }

    [Fact]
    public void UpdateAudioMetadata_WithNonPositiveDuration_KeepsExistingDuration()
    {
        // Arrange
        var sound = Sound.Create("clip", CreateAudioFile(), duration: 3.0, peaks: null, DateTime.UtcNow);

        // Act — a failed/absent worker duration must not zero out a known value.
        sound.UpdateAudioMetadata(44100, 1, "mp3", durationFromWorker: 0, DateTime.UtcNow);

        // Assert
        Assert.Equal(3.0, sound.Duration);
        Assert.Equal(44100, sound.SampleRate);
        Assert.Equal(1, sound.Channels);
        Assert.Equal("mp3", sound.Format);
    }

    [Fact]
    public void UpdateAudioMetadata_WithNonPositiveOrBlankMetadata_StoresNull()
    {
        // Arrange
        var sound = Sound.Create("clip", CreateAudioFile(), duration: 2.0, peaks: null, DateTime.UtcNow);

        // Act
        sound.UpdateAudioMetadata(0, -1, "  ", durationFromWorker: 0, DateTime.UtcNow);

        // Assert
        Assert.Null(sound.SampleRate);
        Assert.Null(sound.Channels);
        Assert.Null(sound.Format);
    }

    private static DomainFile CreateAudioFile()
    {
        return DomainFile.Create(
            "clip.wav",
            "stored_clip.wav",
            "/path/to/clip.wav",
            "audio/wav",
            FileType.Wav,
            88200L,
            "c3d4e5f6789012345678901234567890123456789012345678901234a1b2c3d4",
            DateTime.UtcNow
        );
    }
}
