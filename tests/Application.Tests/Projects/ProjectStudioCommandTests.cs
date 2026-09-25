using Application.Abstractions;
using Application.Abstractions.Repositories;
using Application.Projects;
using Domain.Models;
using Domain.Projects;
using Domain.Services;
using Domain.ValueObjects;
using Moq;
using Xunit;

namespace Application.Tests.Projects;

public class ProjectStudioCommandTests
{
    private static readonly DateTime Now = new(2026, 9, 25, 0, 0, 0, DateTimeKind.Utc);

    [Fact]
    public async Task CreateLevel_WhenNameAlreadyExistsInProject_IsRefused()
    {
        var projects = new Mock<IProjectRepository>();
        var levels = new Mock<IProjectLevelRepository>();
        projects.Setup(r => r.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(Project.Create("Nightfall", null, Now));
        levels.Setup(r => r.NameExistsAsync(
                1, "Forest Crossing", null, It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
        var handler = new CreateProjectLevelCommandHandler(
            projects.Object, levels.Object, Clock(), new Mock<IUnitOfWork>().Object);

        var result = await handler.Handle(new CreateProjectLevelCommand(
            1, "Forest Crossing", null, ProjectLevelStatuses.Planned, 0), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("ProjectLevelNameAlreadyExists", result.Error.Code);
        levels.Verify(r => r.AddAsync(It.IsAny<ProjectLevel>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task CreateProductionNote_WhenBothTargetsArePresent_IsRefused()
    {
        var handler = CreateNoteHandler(out _, out _, out _);

        var result = await handler.Handle(new CreateProductionNoteCommand(
            1, 2, 3, null, "Conflicting target", "A note can only have one target.", false), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("ProductionNoteTargetConflict", result.Error.Code);
    }

    [Fact]
    public async Task CreateProductionNote_WhenLevelBelongsToAnotherProject_IsRefused()
    {
        var handler = CreateNoteHandler(out _, out var levels, out _);

        var result = await handler.Handle(new CreateProductionNoteCommand(
            1, 2, null, null, "Crossing beat", "Keep the path readable.", false), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("ProductionNoteLevelNotFound", result.Error.Code);
        levels.Verify(
            r => r.GetByIdAsync(1, 2, It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task UpdateReference_ReturnsAssociationIdTitleAndLevel()
    {
        var reference = ProjectConceptImage.Create(1, 10, 3, Now);
        typeof(ProjectConceptImage).GetProperty(nameof(ProjectConceptImage.Id))!
            .SetValue(reference, 8);
        var file = Domain.Models.File.Create(
            "crossing.png", "crossing.png", "/uploads/crossing.png", "image/png",
            FileType.Texture, 100, new string('a', 64), Now);
        typeof(ProjectConceptImage).GetProperty(nameof(ProjectConceptImage.File))!
            .SetValue(reference, file);
        var references = new Mock<IProjectReferenceRepository>();
        var levels = new Mock<IProjectLevelRepository>();
        references.Setup(r => r.GetByIdAsync(1, 8, It.IsAny<CancellationToken>()))
            .ReturnsAsync(reference);
        levels.Setup(r => r.GetByIdAsync(1, 2, It.IsAny<CancellationToken>()))
            .ReturnsAsync(ProjectLevel.Create(1, "Forest Crossing", null, ProjectLevelStatuses.Planned, 0, Now));
        var handler = new UpdateProjectReferenceCommandHandler(
            levels.Object,
            references.Object,
            new Mock<IUnitOfWork>().Object);

        var result = await handler.Handle(
            new UpdateProjectReferenceCommand(1, 8, "Misty crossing", 2),
            CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(8, result.Value.Id);
        Assert.Equal("Misty crossing", result.Value.Title);
        Assert.Equal(2, result.Value.ProjectLevelId);
    }

    [Fact]
    public async Task UpdateReference_WhenLevelIsNotInRouteProject_IsRefused()
    {
        var references = new Mock<IProjectReferenceRepository>();
        var levels = new Mock<IProjectLevelRepository>();
        references.Setup(r => r.GetByIdAsync(1, 8, It.IsAny<CancellationToken>()))
            .ReturnsAsync(ProjectConceptImage.Create(1, 10, 0, Now));
        var handler = new UpdateProjectReferenceCommandHandler(
            levels.Object,
            references.Object,
            new Mock<IUnitOfWork>().Object);

        var result = await handler.Handle(
            new UpdateProjectReferenceCommand(1, 8, "Misty crossing", 99),
            CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("ProjectReferenceLevelNotFound", result.Error.Code);
    }

    private static CreateProductionNoteCommandHandler CreateNoteHandler(
        out Mock<IProjectRepository> projects,
        out Mock<IProjectLevelRepository> levels,
        out Mock<IProductionNoteRepository> notes)
    {
        projects = new Mock<IProjectRepository>();
        levels = new Mock<IProjectLevelRepository>();
        notes = new Mock<IProductionNoteRepository>();
        projects.Setup(r => r.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(Project.Create("Nightfall", null, Now));
        return new CreateProductionNoteCommandHandler(
            projects.Object,
            levels.Object,
            new Mock<IProjectReferenceRepository>().Object,
            new Mock<IProjectCharacterRepository>().Object,
            notes.Object,
            Clock(),
            new Mock<IUnitOfWork>().Object);
    }

    private static IDateTimeProvider Clock()
    {
        var clock = new Mock<IDateTimeProvider>();
        clock.SetupGet(c => c.UtcNow).Returns(Now);
        return clock.Object;
    }
}
