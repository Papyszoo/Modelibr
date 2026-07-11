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
/// Rename-policy coverage: renames go through the same DuplicateNamePolicy as
/// creation (Allow default / Reject / AutoRename), with the asset itself excluded
/// from the duplicate check so it can keep or re-case its own name.
/// </summary>
public class UpdateSoundCommandHandlerTests
{
    private readonly Mock<ISoundRepository> _soundRepository = new();
    private readonly Mock<ISoundCategoryRepository> _soundCategoryRepository = new();
    private readonly Mock<ISettingRepository> _settingRepository = new();
    private readonly Mock<IDateTimeProvider> _dateTimeProvider = new();
    private readonly UpdateSoundCommandHandler _handler;

    public UpdateSoundCommandHandlerTests()
    {
        _dateTimeProvider.Setup(x => x.UtcNow).Returns(DateTime.UtcNow);
        _soundRepository
            .Setup(x => x.UpdateAsync(It.IsAny<Sound>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Sound s, CancellationToken _) => s);
        _handler = new UpdateSoundCommandHandler(
            _soundRepository.Object,
            _soundCategoryRepository.Object,
            _settingRepository.Object,
            _dateTimeProvider.Object);
    }

    private static Sound CreateSound(int id, string name)
    {
        var now = DateTime.UtcNow;
        var hash = "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
        var file = DomainFile.Create(
            $"{name}.wav", $"{name}.wav", "/uploads/ab/cd/" + hash,
            "audio/wav", FileType.Wav, 7, hash, now);
        var sound = Sound.Create(name, file, 1.5, null, now);
        typeof(Sound).GetProperty("Id")!.SetValue(sound, id);
        return sound;
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
    public async Task Handle_RenameToExistingName_WhenPolicyUnset_DefaultsToAllow_Succeeds()
    {
        var sound = CreateSound(1, "Footstep");
        var other = CreateSound(2, "Kick");
        _soundRepository.Setup(x => x.GetByIdAsync(1, It.IsAny<CancellationToken>())).ReturnsAsync(sound);
        _soundRepository.Setup(x => x.GetByNameAsync("Kick", It.IsAny<CancellationToken>())).ReturnsAsync(other);
        SetPolicy(null);

        var result = await _handler.Handle(new UpdateSoundCommand(1, "Kick", null), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal("Kick", result.Value.Name);
    }

    [Fact]
    public async Task Handle_RenameToExistingName_WhenPolicyIsReject_Fails()
    {
        var sound = CreateSound(1, "Footstep");
        var other = CreateSound(2, "Kick");
        _soundRepository.Setup(x => x.GetByIdAsync(1, It.IsAny<CancellationToken>())).ReturnsAsync(sound);
        _soundRepository.Setup(x => x.GetByNameAsync("Kick", It.IsAny<CancellationToken>())).ReturnsAsync(other);
        SetPolicy("Reject");

        var result = await _handler.Handle(new UpdateSoundCommand(1, "Kick", null), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("SoundAlreadyExists", result.Error.Code);
        _soundRepository.Verify(x => x.UpdateAsync(It.IsAny<Sound>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Handle_RenameToExistingName_WhenPolicyIsAutoRename_AppendsSuffix()
    {
        var sound = CreateSound(1, "Footstep");
        var other = CreateSound(2, "Kick");
        _soundRepository.Setup(x => x.GetByIdAsync(1, It.IsAny<CancellationToken>())).ReturnsAsync(sound);
        _soundRepository.Setup(x => x.GetByNameAsync("Kick", It.IsAny<CancellationToken>())).ReturnsAsync(other);
        _soundRepository
            .Setup(x => x.GetNamesByPrefixAsync("Kick", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<string> { "Kick" });
        SetPolicy("AutoRename");

        var result = await _handler.Handle(new UpdateSoundCommand(1, "Kick", null), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal("Kick (2)", result.Value.Name);
    }

    [Fact]
    public async Task Handle_ReCaseOwnName_WhenPolicyIsReject_Succeeds()
    {
        // "footstep" → "Footstep": the only holder of that name (case-insensitively via
        // the repo lookup) is the sound itself, which the duplicate check must exclude.
        var sound = CreateSound(1, "footstep");
        _soundRepository.Setup(x => x.GetByIdAsync(1, It.IsAny<CancellationToken>())).ReturnsAsync(sound);
        _soundRepository.Setup(x => x.GetByNameAsync("Footstep", It.IsAny<CancellationToken>())).ReturnsAsync(sound);
        SetPolicy("Reject");

        var result = await _handler.Handle(new UpdateSoundCommand(1, "Footstep", null), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal("Footstep", result.Value.Name);
    }

    [Fact]
    public async Task Handle_NameUnchanged_SkipsPolicyLookupEntirely()
    {
        var sound = CreateSound(1, "Footstep");
        _soundRepository.Setup(x => x.GetByIdAsync(1, It.IsAny<CancellationToken>())).ReturnsAsync(sound);
        SetPolicy("Reject");

        var result = await _handler.Handle(new UpdateSoundCommand(1, "Footstep", null), CancellationToken.None);

        Assert.True(result.IsSuccess);
        _settingRepository.Verify(x => x.GetByKeyAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
        _soundRepository.Verify(x => x.GetByNameAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }
}
