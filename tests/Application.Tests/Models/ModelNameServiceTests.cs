using Application.Abstractions.Repositories;
using Application.Models;
using Application.Settings;
using Domain.Models;
using Moq;
using Xunit;

namespace Application.Tests.Models;

public class AssetNameServiceTests
{
    private static Mock<ISettingRepository> CreateSettingRepository(string? policyValue)
    {
        var repo = new Mock<ISettingRepository>();
        var setting = policyValue == null ? null : Setting.Create(SettingKeys.DuplicateNamePolicy, policyValue, DateTime.UtcNow);
        repo.Setup(x => x.GetByKeyAsync(SettingKeys.DuplicateNamePolicy, It.IsAny<CancellationToken>()))
            .ReturnsAsync(setting);
        repo.Setup(x => x.GetByKeyAsync("ModelDuplicateNamePolicy", It.IsAny<CancellationToken>()))
            .ReturnsAsync((Setting?)null);
        return repo;
    }

    [Fact]
    public async Task GetPolicyAsync_WhenUnset_ReturnsAllow()
    {
        var repo = CreateSettingRepository(null);

        var policy = await AssetNameService.GetPolicyAsync(repo.Object, CancellationToken.None);

        Assert.Equal("Allow", policy);
    }

    [Fact]
    public async Task GetPolicyAsync_WhenSetToReject_ReturnsReject()
    {
        var repo = CreateSettingRepository("Reject");

        var policy = await AssetNameService.GetPolicyAsync(repo.Object, CancellationToken.None);

        Assert.Equal("Reject", policy);
    }

    [Fact]
    public async Task GetPolicyAsync_WhenSetToAutoRename_ReturnsAutoRename()
    {
        var repo = CreateSettingRepository("AutoRename");

        var policy = await AssetNameService.GetPolicyAsync(repo.Object, CancellationToken.None);

        Assert.Equal("AutoRename", policy);
    }

    [Fact]
    public async Task GetPolicyAsync_WhenSetToAllow_ReturnsAllow()
    {
        var repo = CreateSettingRepository("Allow");

        var policy = await AssetNameService.GetPolicyAsync(repo.Object, CancellationToken.None);

        Assert.Equal("Allow", policy);
    }

    [Fact]
    public async Task ResolveNameAsync_WhenPolicyIsAllow_ReturnsRequestedNameUnchanged_WithoutExistenceCheck()
    {
        var repo = CreateSettingRepository("Allow");
        var existsCalled = false;

        var result = await AssetNameService.ResolveNameAsync(
            "Chair", "Model",
            (_, _) => { existsCalled = true; return Task.FromResult(true); },
            (_, _) => Task.FromResult<IReadOnlyList<string>>(new List<string>()),
            repo.Object,
            CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal("Chair", result.Value);
        Assert.False(existsCalled, "Allow policy must skip the existence check entirely.");
    }

    [Fact]
    public async Task ResolveNameAsync_WhenPolicyUnset_DefaultsToAllow_SkipsExistenceCheck()
    {
        var repo = CreateSettingRepository(null);
        var existsCalled = false;

        var result = await AssetNameService.ResolveNameAsync(
            "Chair", "Model",
            (_, _) => { existsCalled = true; return Task.FromResult(true); },
            (_, _) => Task.FromResult<IReadOnlyList<string>>(new List<string>()),
            repo.Object,
            CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal("Chair", result.Value);
        Assert.False(existsCalled);
    }

    [Fact]
    public async Task ResolveNameAsync_WhenPolicyIsReject_AndNameExists_ReturnsFailure()
    {
        var repo = CreateSettingRepository("Reject");

        var result = await AssetNameService.ResolveNameAsync(
            "Chair", "Model",
            (_, _) => Task.FromResult(true),
            (_, _) => Task.FromResult<IReadOnlyList<string>>(new List<string>()),
            repo.Object,
            CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("ModelNameAlreadyExists", result.Error.Code);
    }

    [Fact]
    public async Task ResolveNameAsync_WhenPolicyIsAutoRename_AndNameExists_ReturnsRenamedName()
    {
        var repo = CreateSettingRepository("AutoRename");

        var result = await AssetNameService.ResolveNameAsync(
            "Chair", "Model",
            (_, _) => Task.FromResult(true),
            (_, _) => Task.FromResult<IReadOnlyList<string>>(new List<string> { "Chair" }),
            repo.Object,
            CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal("Chair (2)", result.Value);
    }

    [Fact]
    public async Task ResolveNameAsync_WhenPolicyIsAllow_AndNameAlreadyExists_StillReturnsSameNameUnchanged()
    {
        // The whole point of "Allow": two assets legitimately share a name. WebDAV
        // disambiguates by id; the Application layer must not rename or reject.
        var repo = CreateSettingRepository("Allow");

        var result = await AssetNameService.ResolveNameAsync(
            "Chair", "Model",
            (_, _) => Task.FromResult(true),
            (_, _) => Task.FromResult<IReadOnlyList<string>>(new List<string> { "Chair" }),
            repo.Object,
            CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal("Chair", result.Value);
    }

    [Fact]
    public void GetBaseName_WithPlainName_ReturnsSameName()
    {
        Assert.Equal("Chair", AssetNameService.GetBaseName("Chair"));
    }

    [Fact]
    public void GetBaseName_WithSuffix2_ReturnsBaseName()
    {
        Assert.Equal("Chair", AssetNameService.GetBaseName("Chair (2)"));
    }

    [Fact]
    public void GetBaseName_WithSuffix3_ReturnsBaseName()
    {
        Assert.Equal("Chair", AssetNameService.GetBaseName("Chair (3)"));
    }

    [Fact]
    public void GetBaseName_WithNestedSuffix_StripsOuterSuffix()
    {
        Assert.Equal("Chair (2)", AssetNameService.GetBaseName("Chair (2) (3)"));
    }

    [Fact]
    public void GetBaseName_WithNoNumericSuffix_ReturnsSameName()
    {
        Assert.Equal("Chair (abc)", AssetNameService.GetBaseName("Chair (abc)"));
    }

    [Fact]
    public void GenerateUniqueName_WhenNoExistingNames_Returns2()
    {
        var result = AssetNameService.GenerateUniqueName("Chair", new List<string>());
        Assert.Equal("Chair (2)", result);
    }

    [Fact]
    public void GenerateUniqueName_When2Exists_Returns3()
    {
        var existing = new List<string> { "Chair", "Chair (2)" };
        var result = AssetNameService.GenerateUniqueName("Chair", existing);
        Assert.Equal("Chair (3)", result);
    }

    [Fact]
    public void GenerateUniqueName_When2And3Exist_Returns4()
    {
        var existing = new List<string> { "Chair", "Chair (2)", "Chair (3)" };
        var result = AssetNameService.GenerateUniqueName("Chair", existing);
        Assert.Equal("Chair (4)", result);
    }

    [Fact]
    public void GenerateUniqueName_WithGap_ReturnsFirstAvailable()
    {
        var existing = new List<string> { "Chair", "Chair (2)", "Chair (4)" };
        var result = AssetNameService.GenerateUniqueName("Chair", existing);
        Assert.Equal("Chair (3)", result);
    }

    [Fact]
    public void GenerateUniqueName_HandlesNameWithSpaces()
    {
        var existing = new List<string> { "My Chair Model", "My Chair Model (2)" };
        var result = AssetNameService.GenerateUniqueName("My Chair Model", existing);
        Assert.Equal("My Chair Model (3)", result);
    }
}
