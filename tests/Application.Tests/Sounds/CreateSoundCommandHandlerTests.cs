using Application.Abstractions;
using Application.Abstractions.Repositories;
using Application.Settings;
using Application.Sounds;
using Domain.Models;
using Domain.Services;
using Domain.ValueObjects;
using Moq;
using Xunit;
using DomainFile = Domain.Models.File;

namespace Application.Tests.Sounds;

/// <summary>
/// Duplicate-name policy coverage for the create-from-existing-FileId endpoint:
/// like the upload path, creation follows DuplicateNamePolicy (Allow default /
/// Reject / AutoRename) instead of unconditionally rejecting duplicates.
/// </summary>
public class CreateSoundCommandHandlerTests
{
    private readonly Mock<ISoundRepository> _soundRepository = new();
    private readonly Mock<ISoundCategoryRepository> _soundCategoryRepository = new();
    private readonly Mock<IFileRepository> _fileRepository = new();
    private readonly Mock<ISettingRepository> _settingRepository = new();
    private readonly Mock<IDateTimeProvider> _dateTimeProvider = new();
    private readonly Mock<IUnitOfWork> _unitOfWork = new();
    private readonly CreateSoundCommandHandler _handler;

    public CreateSoundCommandHandlerTests()
    {
        _dateTimeProvider.Setup(x => x.UtcNow).Returns(DateTime.UtcNow);

        var now = DateTime.UtcNow;
        var hash = "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
        var file = DomainFile.Create(
            "clip.wav", "clip.wav", "/uploads/ab/cd/" + hash,
            "audio/wav", FileType.Wav, 7, hash, now);
        _fileRepository
            .Setup(x => x.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(file);

        _soundRepository
            .Setup(x => x.AddAsync(It.IsAny<Sound>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Sound s, CancellationToken _) =>
            {
                typeof(Sound).GetProperty("Id")!.SetValue(s, 10);
                return s;
            });

        _handler = new CreateSoundCommandHandler(
            _soundRepository.Object,
            _soundCategoryRepository.Object,
            _fileRepository.Object,
            _settingRepository.Object,
            _dateTimeProvider.Object,
            _unitOfWork.Object);
    }

    private void SetPolicy(string? policyValue)
    {
        var setting = policyValue == null
            ? null
            : Setting.Create(SettingKeys.DuplicateNamePolicy, policyValue, DateTime.UtcNow);
        _settingRepository
            .Setup(x => x.GetByKeyAsync(SettingKeys.DuplicateNamePolicy, It.IsAny<CancellationToken>()))
            .ReturnsAsync(setting);
        _settingRepository
            .Setup(x => x.GetByKeyAsync("ModelDuplicateNamePolicy", It.IsAny<CancellationToken>()))
            .ReturnsAsync((Setting?)null);
    }

    [Fact]
    public async Task Handle_DuplicateName_WhenPolicyUnset_DefaultsToAllow_CreatesWithSameName()
    {
        SetPolicy(null);

        var result = await _handler.Handle(
            new CreateSoundCommand("Footstep", 1, 1.5, null), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal("Footstep", result.Value.Name);
        // Allow skips the existence check entirely.
        _soundRepository.Verify(x => x.ExistsByNameAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
        _soundRepository.Verify(x => x.AddAsync(It.IsAny<Sound>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_DuplicateName_WhenPolicyIsReject_Fails()
    {
        SetPolicy("Reject");
        _soundRepository
            .Setup(x => x.ExistsByNameAsync("Footstep", It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

        var result = await _handler.Handle(
            new CreateSoundCommand("Footstep", 1, 1.5, null), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("SoundAlreadyExists", result.Error.Code);
        _soundRepository.Verify(x => x.AddAsync(It.IsAny<Sound>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Handle_DuplicateName_WhenPolicyIsAutoRename_CreatesWithSuffix()
    {
        SetPolicy("AutoRename");
        _soundRepository
            .Setup(x => x.ExistsByNameAsync("Footstep", It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
        _soundRepository
            .Setup(x => x.GetNamesByPrefixAsync("Footstep", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<string> { "Footstep" });

        var result = await _handler.Handle(
            new CreateSoundCommand("Footstep", 1, 1.5, null), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal("Footstep (2)", result.Value.Name);
    }
}
