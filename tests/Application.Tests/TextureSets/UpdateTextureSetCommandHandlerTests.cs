using Application.Abstractions;
using Application.Abstractions.Repositories;
using Application.Settings;
using Application.TextureSets;
using Domain.Models;
using Domain.Services;
using Moq;
using Xunit;

namespace Application.Tests.TextureSets;

/// <summary>
/// Rename-policy coverage: renames go through the same DuplicateNamePolicy as
/// creation (Allow default / Reject / AutoRename), with the texture set itself
/// excluded from the duplicate check so it can keep its own name.
/// </summary>
public class UpdateTextureSetCommandHandlerTests
{
    private readonly Mock<ITextureSetRepository> _textureSetRepository = new();
    private readonly Mock<ITextureSetCategoryRepository> _textureSetCategoryRepository = new();
    private readonly Mock<ISettingRepository> _settingRepository = new();
    private readonly Mock<IDateTimeProvider> _dateTimeProvider = new();
    private readonly Mock<IUnitOfWork> _unitOfWork = new();
    private readonly UpdateTextureSetCommandHandler _handler;

    public UpdateTextureSetCommandHandlerTests()
    {
        _dateTimeProvider.Setup(x => x.UtcNow).Returns(DateTime.UtcNow);
        _textureSetRepository
            .Setup(x => x.UpdateAsync(It.IsAny<TextureSet>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((TextureSet ts, CancellationToken _) => ts);
        _handler = new UpdateTextureSetCommandHandler(
            _textureSetRepository.Object,
            _textureSetCategoryRepository.Object,
            _settingRepository.Object,
            _dateTimeProvider.Object,
            _unitOfWork.Object);
    }

    private static TextureSet CreateTextureSet(int id, string name)
    {
        var textureSet = TextureSet.Create(name, DateTime.UtcNow);
        typeof(TextureSet).GetProperty("Id")!.SetValue(textureSet, id);
        return textureSet;
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
        var textureSet = CreateTextureSet(1, "Wood");
        var other = CreateTextureSet(2, "Stone");
        _textureSetRepository.Setup(x => x.GetByIdAsync(1, It.IsAny<CancellationToken>())).ReturnsAsync(textureSet);
        _textureSetRepository.Setup(x => x.GetByNameAsync("Stone", It.IsAny<CancellationToken>())).ReturnsAsync(other);
        SetPolicy(null);

        var result = await _handler.Handle(new UpdateTextureSetCommand(1, "Stone", null), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal("Stone", result.Value.Name);
    }

    [Fact]
    public async Task Handle_RenameToExistingName_WhenPolicyIsReject_Fails()
    {
        var textureSet = CreateTextureSet(1, "Wood");
        var other = CreateTextureSet(2, "Stone");
        _textureSetRepository.Setup(x => x.GetByIdAsync(1, It.IsAny<CancellationToken>())).ReturnsAsync(textureSet);
        _textureSetRepository.Setup(x => x.GetByNameAsync("Stone", It.IsAny<CancellationToken>())).ReturnsAsync(other);
        SetPolicy("Reject");

        var result = await _handler.Handle(new UpdateTextureSetCommand(1, "Stone", null), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("TextureSetNameAlreadyExists", result.Error.Code);
        _textureSetRepository.Verify(x => x.UpdateAsync(It.IsAny<TextureSet>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Handle_RenameToExistingName_WhenPolicyIsAutoRename_AppendsSuffix()
    {
        var textureSet = CreateTextureSet(1, "Wood");
        var other = CreateTextureSet(2, "Stone");
        _textureSetRepository.Setup(x => x.GetByIdAsync(1, It.IsAny<CancellationToken>())).ReturnsAsync(textureSet);
        _textureSetRepository.Setup(x => x.GetByNameAsync("Stone", It.IsAny<CancellationToken>())).ReturnsAsync(other);
        _textureSetRepository
            .Setup(x => x.GetNamesByPrefixAsync("Stone", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<string> { "Stone" });
        SetPolicy("AutoRename");

        var result = await _handler.Handle(new UpdateTextureSetCommand(1, "Stone", null), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal("Stone (2)", result.Value.Name);
    }

    [Fact]
    public async Task Handle_NameUnchanged_SkipsPolicyLookupEntirely()
    {
        // Category-only updates keep the same name - they must not consult the policy
        // or the by-name lookup at all (an asset can always keep its own name).
        var textureSet = CreateTextureSet(1, "Wood");
        _textureSetRepository.Setup(x => x.GetByIdAsync(1, It.IsAny<CancellationToken>())).ReturnsAsync(textureSet);
        SetPolicy("Reject");

        var result = await _handler.Handle(new UpdateTextureSetCommand(1, "Wood", null), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal("Wood", result.Value.Name);
        _settingRepository.Verify(x => x.GetByKeyAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
        _textureSetRepository.Verify(x => x.GetByNameAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }
}
