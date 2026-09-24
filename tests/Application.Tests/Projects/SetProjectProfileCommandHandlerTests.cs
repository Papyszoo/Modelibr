using Application.Abstractions;
using Application.Abstractions.Repositories;
using Application.Projects.Profile;
using Domain.Models;
using Domain.Services;
using Moq;
using Xunit;

namespace Application.Tests.Projects;

public sealed class SetProjectProfileCommandHandlerTests
{
    private static readonly DateTime Now = new(2026, 9, 25, 12, 0, 0, DateTimeKind.Utc);

    private readonly Mock<IProjectRepository> _projects = new();
    private readonly Mock<IProjectProfileOptionRepository> _options = new();
    private readonly Mock<IDateTimeProvider> _clock = new();
    private readonly Mock<IUnitOfWork> _unitOfWork = new();

    public SetProjectProfileCommandHandlerTests()
    {
        _clock.SetupGet(c => c.UtcNow).Returns(Now);
        _unitOfWork
            .Setup(u => u.SaveChangesAsync(It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);
    }

    [Fact]
    public async Task OmittedSettings_PreserveExistingProductionConstraints()
    {
        var project = ProjectWithSettings();
        _projects.Setup(r => r.GetByIdAsync(42, It.IsAny<CancellationToken>()))
            .ReturnsAsync(project);
        var handler = CreateHandler();

        var result = await handler.Handle(
            new SetProjectProfileCommand(
                42,
                Settings: new ProjectProfileSettings()),
            CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(5_000, project.MaxTrianglesPerAsset);
        Assert.Equal(128, project.PixelsPerUnit);
        Assert.Equal(100, project.UnitsPerMetre);
        Assert.Equal("Z", project.UpAxis);
        Assert.Equal("left", project.Handedness);
        Assert.Equal(["#123456"], project.PaletteHex);
    }

    [Fact]
    public async Task ExplicitClear_ClearsOnlyTheNamedSetting()
    {
        var project = ProjectWithSettings();
        _projects.Setup(r => r.GetByIdAsync(42, It.IsAny<CancellationToken>()))
            .ReturnsAsync(project);
        var handler = CreateHandler();

        var result = await handler.Handle(
            new SetProjectProfileCommand(
                42,
                Settings: new ProjectProfileSettings(
                    Clear: new HashSet<string>(StringComparer.OrdinalIgnoreCase)
                    {
                        "maxTrianglesPerAsset",
                    })),
            CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Null(project.MaxTrianglesPerAsset);
        Assert.Equal(128, project.PixelsPerUnit);
        Assert.Equal(100, project.UnitsPerMetre);
        Assert.Equal("Z", project.UpAxis);
        Assert.Equal("left", project.Handedness);
        Assert.Equal(["#123456"], project.PaletteHex);
    }

    [Fact]
    public async Task ConflictingValueAndClear_AreRejected()
    {
        var project = ProjectWithSettings();
        _projects.Setup(r => r.GetByIdAsync(42, It.IsAny<CancellationToken>()))
            .ReturnsAsync(project);
        var handler = CreateHandler();

        var result = await handler.Handle(
            new SetProjectProfileCommand(
                42,
                Settings: new ProjectProfileSettings(
                    MaxTrianglesPerAsset: 7_000,
                    Clear: new HashSet<string>(StringComparer.OrdinalIgnoreCase)
                    {
                        "maxTrianglesPerAsset",
                    })),
            CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("ConflictingProfileSetting", result.Error.Code);
        Assert.Equal(5_000, project.MaxTrianglesPerAsset);
        _unitOfWork.Verify(
            u => u.SaveChangesAsync(It.IsAny<CancellationToken>()),
            Times.Never);
    }

    private SetProjectProfileCommandHandler CreateHandler()
        => new(
            _projects.Object,
            _options.Object,
            _clock.Object,
            _unitOfWork.Object);

    private static Project ProjectWithSettings()
    {
        var project = Project.Create("Patch safety", null, Now);
        project.SetProfileSettings(
            5_000,
            1_024,
            50_000,
            128,
            100,
            "Z",
            "left",
            ["#123456"],
            Now);
        return project;
    }
}
