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
    public async Task CreateProjectComment_WhenBothTargetsArePresent_IsRefused()
    {
        var handler = CreateCommentHandler(out _, out var comments);

        var result = await handler.Handle(new CreateProjectCommentCommand(
            1, new ProjectCommentTarget(LevelId: 2, ReferenceImageId: 3), "Conflicting target", "A comment can only have one target.", false),
            CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("ProjectCommentTargetConflict", result.Error.Code);
        comments.Verify(r => r.AddAsync(It.IsAny<ProjectComment>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task CreateProjectComment_WhenLevelBelongsToAnotherProject_IsRefused()
    {
        var handler = CreateCommentHandler(out _, out var comments);
        comments.Setup(r => r.TargetExistsAsync(1, It.Is<ProjectCommentTarget>(t => t.LevelId == 2 && t.Count == 1), It.IsAny<CancellationToken>()))
            .ReturnsAsync(false);

        var result = await handler.Handle(new CreateProjectCommentCommand(
            1, new ProjectCommentTarget(LevelId: 2), "Crossing beat", "Keep the path readable.", false), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("ProjectCommentTargetNotFound", result.Error.Code);
        Assert.Contains("Level 2", result.Error.Message);
    }

    [Fact]
    public async Task UpdateReference_ReturnsAssociationIdAndTitle()
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
        references.Setup(r => r.GetByIdAsync(1, 8, It.IsAny<CancellationToken>()))
            .ReturnsAsync(reference);
        var handler = new UpdateProjectReferenceCommandHandler(
            references.Object,
            new Mock<IUnitOfWork>().Object);

        var result = await handler.Handle(
            new UpdateProjectReferenceCommand(1, 8, "Misty crossing"),
            CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(8, result.Value.Id);
        Assert.Equal("Misty crossing", result.Value.Title);
        Assert.Empty(result.Value.Links);
    }

    [Fact]
    public async Task AddReferenceLink_LinksImageToLevelAndCharacterAndRefusesDuplicates()
    {
        var reference = ProjectConceptImage.Create(1, 10, 0, Now);
        typeof(ProjectConceptImage).GetProperty(nameof(ProjectConceptImage.Id))!
            .SetValue(reference, 8);
        var references = new Mock<IProjectReferenceRepository>();
        var levels = new Mock<IProjectLevelRepository>();
        var characters = new Mock<IProjectCharacterRepository>();
        references.Setup(r => r.GetByIdAsync(1, 8, It.IsAny<CancellationToken>()))
            .ReturnsAsync(reference);
        levels.Setup(r => r.GetByIdAsync(1, 2, It.IsAny<CancellationToken>()))
            .ReturnsAsync(ProjectLevel.Create(1, "Forest Crossing", null, ProjectLevelStatuses.Planned, 0, Now));
        var handler = new AddProjectReferenceLinkCommandHandler(
            levels.Object,
            characters.Object,
            references.Object,
            new Mock<IUnitOfWork>().Object,
            Clock());

        var levelLink = await handler.Handle(
            new AddProjectReferenceLinkCommand(1, 8, 2, null),
            CancellationToken.None);

        Assert.True(levelLink.IsSuccess);
        Assert.Equal(ProjectReferenceLink.LevelTarget, levelLink.Value.TargetType);
        Assert.Equal(2, levelLink.Value.ProjectLevelId);

        var duplicate = await handler.Handle(
            new AddProjectReferenceLinkCommand(1, 8, 2, null),
            CancellationToken.None);

        Assert.True(duplicate.IsFailure);
        Assert.Equal("InvalidProjectReferenceLink", duplicate.Error.Code);
    }

    [Fact]
    public async Task AddReferenceLink_WhenTargetIsNotInRouteProject_IsRefused()
    {
        var reference = ProjectConceptImage.Create(1, 10, 0, Now);
        typeof(ProjectConceptImage).GetProperty(nameof(ProjectConceptImage.Id))!
            .SetValue(reference, 8);
        var references = new Mock<IProjectReferenceRepository>();
        references.Setup(r => r.GetByIdAsync(1, 8, It.IsAny<CancellationToken>()))
            .ReturnsAsync(reference);
        var handler = new AddProjectReferenceLinkCommandHandler(
            new Mock<IProjectLevelRepository>().Object,
            new Mock<IProjectCharacterRepository>().Object,
            references.Object,
            new Mock<IUnitOfWork>().Object,
            Clock());

        var result = await handler.Handle(
            new AddProjectReferenceLinkCommand(1, 8, 99, null),
            CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("ProjectReferenceLevelNotFound", result.Error.Code);
    }

    [Fact]
    public async Task AddReferenceLink_WhenBothTargetsAreSupplied_IsRefused()
    {
        var reference = ProjectConceptImage.Create(1, 10, 0, Now);
        typeof(ProjectConceptImage).GetProperty(nameof(ProjectConceptImage.Id))!
            .SetValue(reference, 8);
        var references = new Mock<IProjectReferenceRepository>();
        references.Setup(r => r.GetByIdAsync(1, 8, It.IsAny<CancellationToken>()))
            .ReturnsAsync(reference);
        var handler = new AddProjectReferenceLinkCommandHandler(
            new Mock<IProjectLevelRepository>().Object,
            new Mock<IProjectCharacterRepository>().Object,
            references.Object,
            new Mock<IUnitOfWork>().Object,
            Clock());

        var result = await handler.Handle(
            new AddProjectReferenceLinkCommand(1, 8, 2, 4),
            CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("InvalidProjectReferenceLink", result.Error.Code);
    }

    private static CreateProjectCommentCommandHandler CreateCommentHandler(
        out Mock<IProjectRepository> projects,
        out Mock<IProjectCommentRepository> comments)
    {
        projects = new Mock<IProjectRepository>();
        comments = new Mock<IProjectCommentRepository>();
        projects.Setup(r => r.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(Project.Create("Sample project", null, Now));
        return new CreateProjectCommentCommandHandler(
            projects.Object,
            comments.Object,
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
