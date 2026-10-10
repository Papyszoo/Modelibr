using Application.Abstractions;
using Application.Abstractions.Repositories;
using Application.Projects;
using Domain.Models;
using Domain.Projects;
using Domain.Services;
using Application.Tests;
using Domain.ValueObjects;
using Moq;
using Xunit;

namespace Application.Tests.Projects;

public class ProjectCharacterCommandTests
{
    private static readonly DateTime Now = new(2026, 9, 25, 0, 0, 0, DateTimeKind.Utc);

    [Fact]
    public async Task CreateCharacter_PersistsProjectTagsAndIdentity()
    {
        var projects = new Mock<IProjectRepository>();
        projects.Setup(r => r.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(Project.Create("Nightfall", null, Now));
        var tags = new Mock<IProjectCharacterTagRepository>();
        var enemy = ProjectCharacterTag.Create(1, "enemy", Now);
        tags.Setup(r => r.GetOrCreateAsync(1, It.IsAny<IEnumerable<string>>(), Now, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { enemy });
        var characters = new Mock<IProjectCharacterRepository>();
        characters.Setup(r => r.NameExistsAsync(1, It.IsAny<string>(), null, It.IsAny<CancellationToken>()))
            .ReturnsAsync(false);
        var handler = new CreateProjectCharacterCommandHandler(
            projects.Object,
            characters.Object,
            tags.Object,
            Clock(),
            new Mock<IUnitOfWork>().Object);

        var result = await handler.Handle(
            new CreateProjectCharacterCommand(1, "Ashen Warden", "A firebound guardian.", new[] { "enemy" }),
            CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal("Ashen Warden", result.Value.Name);
        Assert.Equal(new[] { "enemy" }, result.Value.Tags);
        Assert.True(result.Value.UpdatedAt == Now);
    }

    [Fact]
    public async Task CreateCharacter_WhenNameAlreadyExists_RefusesWithAValidationError()
    {
        // Without this check the unique (ProjectId, Name) index throws a DbUpdateException and
        // the endpoint answers 500. A clashing name is an ordinary validation error.
        var projects = new Mock<IProjectRepository>();
        projects.Setup(r => r.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(Project.Create("Nightfall", null, Now));
        var characters = new Mock<IProjectCharacterRepository>();
        characters.Setup(r => r.NameExistsAsync(1, "Ashen Warden", null, It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
        var handler = new CreateProjectCharacterCommandHandler(
            projects.Object,
            characters.Object,
            new Mock<IProjectCharacterTagRepository>().Object,
            Clock(),
            new Mock<IUnitOfWork>().Object);

        var result = await handler.Handle(
            new CreateProjectCharacterCommand(1, "Ashen Warden", null),
            CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("ProjectCharacterNameAlreadyExists", result.Error.Code);
        characters.Verify(
            r => r.AddAsync(It.IsAny<ProjectCharacter>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task UpdateCharacter_ReplacesTagsAndReturnsTheCharacter()
    {
        var character = ProjectCharacter.Create(1, "Ashen Warden", "Old description", Now).WithId(7);
        var characters = new Mock<IProjectCharacterRepository>();
        characters.Setup(r => r.GetByIdAsync(1, 7, It.IsAny<CancellationToken>()))
            .ReturnsAsync(character);
        characters.Setup(r => r.NameExistsAsync(1, "Ashen Warden", 7, It.IsAny<CancellationToken>()))
            .ReturnsAsync(false);
        var tags = new Mock<IProjectCharacterTagRepository>();
        var boss = ProjectCharacterTag.Create(1, "boss", Now);
        tags.Setup(r => r.GetOrCreateAsync(1, It.IsAny<IEnumerable<string>>(), Now, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { boss });
        var handler = new UpdateProjectCharacterCommandHandler(
            characters.Object,
            tags.Object,
            Clock(),
            new Mock<IUnitOfWork>().Object);

        var result = await handler.Handle(
            new UpdateProjectCharacterCommand(1, 7, "Ashen Warden", "New description", new[] { "boss" }),
            CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal("New description", result.Value.Description);
        Assert.Equal(new[] { "boss" }, result.Value.Tags);
    }

    [Fact]
    public async Task DeleteCharacter_UsesTheRouteProjectForOwnership()
    {
        var characters = new Mock<IProjectCharacterRepository>();
        characters.Setup(r => r.GetByIdAsync(1, 7, It.IsAny<CancellationToken>()))
            .ReturnsAsync((ProjectCharacter?)null);
        var handler = new DeleteProjectCharacterCommandHandler(
            characters.Object,
            new Mock<IProjectReferenceRepository>().Object,
            new Mock<IUnitOfWork>().Object);

        var result = await handler.Handle(new DeleteProjectCharacterCommand(1, 7), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("ProjectCharacterNotFound", result.Error.Code);
    }

    [Fact]
    public async Task DeleteCharacter_UnlinksReferenceImagesBeforeRemovingIt()
    {
        // The link FK is SET NULL, and CK_ProjectReferenceLinks_OneTarget requires a link to
        // keep exactly one target - so clearing the column alone is refused by the database
        // and the delete answers 500. The reference images stay; only the links go.
        var character = ProjectCharacter.Create(1, "Ashen Warden", null, Now).WithId(7);
        var characters = new Mock<IProjectCharacterRepository>();
        characters.Setup(r => r.GetByIdAsync(1, 7, It.IsAny<CancellationToken>()))
            .ReturnsAsync(character);
        var references = new Mock<IProjectReferenceRepository>();
        var handler = new DeleteProjectCharacterCommandHandler(
            characters.Object,
            references.Object,
            new Mock<IUnitOfWork>().Object);

        var result = await handler.Handle(new DeleteProjectCharacterCommand(1, 7), CancellationToken.None);

        Assert.True(result.IsSuccess);
        references.Verify(
            r => r.DeleteLinksForCharacterAsync(1, 7, It.IsAny<CancellationToken>()), Times.Once);
        characters.Verify(
            r => r.DeleteAsync(character, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task AddCharacterImage_WhenFileDoesNotExist_RefusesTheLink()
    {
        var character = ProjectCharacter.Create(1, "Ashen Warden", null, Now).WithId(7);
        var characters = new Mock<IProjectCharacterRepository>();
        characters.Setup(r => r.GetByIdAsync(1, 7, It.IsAny<CancellationToken>()))
            .ReturnsAsync(character);
        var handler = new AddProjectCharacterImageCommandHandler(
            characters.Object,
            new Mock<IFileRepository>().Object,
            Clock(),
            new Mock<IUnitOfWork>().Object);

        var result = await handler.Handle(
            new AddProjectCharacterImageCommand(1, 7, 99),
            CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("FileNotFound", result.Error.Code);
    }

    [Fact]
    public async Task AddCharacterVariant_WhenLevelBelongsToAnotherProject_RefusesTheLink()
    {
        var character = ProjectCharacter.Create(1, "Ashen Warden", null, Now).WithId(7);
        var characters = new Mock<IProjectCharacterRepository>();
        characters.Setup(r => r.GetByIdAsync(1, 7, It.IsAny<CancellationToken>()))
            .ReturnsAsync(character);
        var levels = new Mock<IProjectLevelRepository>();
        levels.Setup(r => r.GetByIdAsync(1, 22, It.IsAny<CancellationToken>()))
            .ReturnsAsync((ProjectLevel?)null);
        var handler = new AddCharacterVariantCommandHandler(
            characters.Object,
            levels.Object,
            Clock(),
            new Mock<IUnitOfWork>().Object);

        var result = await handler.Handle(
            new AddCharacterVariantCommand(1, 7, "Frozen", "A level-specific form.", 22),
            CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("ProjectLevelNotFound", result.Error.Code);
        characters.Verify(
            r => r.UpdateAsync(It.IsAny<ProjectCharacter>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task UpdateCharacterImage_UpdatesTitleCaptionAndSortOrder()
    {
        var character = ProjectCharacter.Create(1, "Ashen Warden", null, Now).WithId(7);
        var file = Domain.Models.File.Create(
            "warden.png", "warden.png", "/uploads/warden.png", "image/png",
            FileType.Texture, 100, new string('a', 64), Now).WithId<Domain.Models.File>(11);
        var image = character.AddImage(file, "Old title", "Old caption", 1, Now).WithId<ProjectCharacterImage>(101);
        var characters = new Mock<IProjectCharacterRepository>();
        characters.Setup(r => r.GetByIdAsync(1, 7, It.IsAny<CancellationToken>()))
            .ReturnsAsync(character);
        var handler = new UpdateProjectCharacterImageCommandHandler(
            characters.Object, Clock(), new Mock<IUnitOfWork>().Object);

        var result = await handler.Handle(
            new UpdateProjectCharacterImageCommand(1, 7, 101, "New title", "New caption", 3),
            CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal("New title", result.Value.Title);
        Assert.Equal("New caption", result.Value.Caption);
        Assert.Equal(3, result.Value.SortOrder);
    }

    [Fact]
    public async Task UpdateCharacterModel_UpdatesLabelAndSortOrder()
    {
        var character = ProjectCharacter.Create(1, "Ashen Warden", null, Now).WithId(7);
        var model = Model.Create("Warden source", Now).WithId<Model>(12);
        var link = character.AddModel(model, "Old label", 1, Now).WithId<ProjectCharacterModel>(102);
        var characters = new Mock<IProjectCharacterRepository>();
        characters.Setup(r => r.GetByIdAsync(1, 7, It.IsAny<CancellationToken>()))
            .ReturnsAsync(character);
        var handler = new UpdateProjectCharacterModelCommandHandler(
            characters.Object, Clock(), new Mock<IUnitOfWork>().Object);

        var result = await handler.Handle(
            new UpdateProjectCharacterModelCommand(1, 7, 102, "Combat source", 4),
            CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal("Combat source", result.Value.Label);
        Assert.Equal(4, result.Value.SortOrder);
    }

    [Fact]
    public async Task UpdateCharacterAbility_UpdatesNameDescriptionAndSortOrder()
    {
        var character = ProjectCharacter.Create(1, "Ashen Warden", null, Now).WithId(7);
        var ability = character.AddAbility("Ember lash", "Old description", 1, Now).WithId<CharacterAbility>(103);
        var characters = new Mock<IProjectCharacterRepository>();
        characters.Setup(r => r.GetByIdAsync(1, 7, It.IsAny<CancellationToken>()))
            .ReturnsAsync(character);
        var handler = new UpdateCharacterAbilityCommandHandler(
            characters.Object, Clock(), new Mock<IUnitOfWork>().Object);

        var result = await handler.Handle(
            new UpdateCharacterAbilityCommand(1, 7, 103, "Ash guard", "Blocks fire", 5),
            CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal("Ash guard", result.Value.Name);
        Assert.Equal("Blocks fire", result.Value.Description);
        Assert.Equal(5, result.Value.SortOrder);
    }

    [Fact]
    public async Task UpdateCharacterVariant_UpdatesLevelAndSortOrderForTheRouteProject()
    {
        var character = ProjectCharacter.Create(1, "Ashen Warden", null, Now).WithId(7);
        var variant = character.AddVariant("Frozen", "Old description", null, 1, Now).WithId<CharacterVariant>(104);
        var characters = new Mock<IProjectCharacterRepository>();
        characters.Setup(r => r.GetByIdAsync(1, 7, It.IsAny<CancellationToken>()))
            .ReturnsAsync(character);
        var levels = new Mock<IProjectLevelRepository>();
        var level = ProjectLevel.Create(1, "Forest Crossing", null, "planned", 0, Now).WithId(22);
        levels.Setup(r => r.GetByIdAsync(1, 22, It.IsAny<CancellationToken>()))
            .ReturnsAsync(level);
        var handler = new UpdateCharacterVariantCommandHandler(
            characters.Object, levels.Object, Clock(), new Mock<IUnitOfWork>().Object);

        var result = await handler.Handle(
            new UpdateCharacterVariantCommand(1, 7, 104, "Frozen form", "Level-specific form.", 22, 6),
            CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(22, result.Value.ProjectLevelId);
        Assert.Equal("Forest Crossing", result.Value.ProjectLevelName);
        Assert.Equal(6, result.Value.SortOrder);
    }

    [Fact]
    public async Task UpdateCharacterVariant_WhenLevelIsOutsideTheRouteProject_RefusesTheEdit()
    {
        var character = ProjectCharacter.Create(1, "Ashen Warden", null, Now).WithId(7);
        var variant = character.AddVariant("Frozen", null, null, 1, Now).WithId<CharacterVariant>(104);
        var characters = new Mock<IProjectCharacterRepository>();
        characters.Setup(r => r.GetByIdAsync(1, 7, It.IsAny<CancellationToken>()))
            .ReturnsAsync(character);
        var levels = new Mock<IProjectLevelRepository>();
        levels.Setup(r => r.GetByIdAsync(1, 22, It.IsAny<CancellationToken>()))
            .ReturnsAsync((ProjectLevel?)null);
        var handler = new UpdateCharacterVariantCommandHandler(
            characters.Object, levels.Object, Clock(), new Mock<IUnitOfWork>().Object);

        var result = await handler.Handle(
            new UpdateCharacterVariantCommand(1, 7, 104, "Frozen", null, 22),
            CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("ProjectLevelNotFound", result.Error.Code);
        characters.Verify(
            r => r.UpdateAsync(It.IsAny<ProjectCharacter>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task UpdateCharacterImage_WhenCharacterIsOutsideTheRouteProject_RefusesTheEdit()
    {
        var handler = new UpdateProjectCharacterImageCommandHandler(
            new Mock<IProjectCharacterRepository>().Object,
            Clock(),
            new Mock<IUnitOfWork>().Object);

        var result = await handler.Handle(
            new UpdateProjectCharacterImageCommand(2, 7, 101, "New title", null),
            CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("ProjectCharacterNotFound", result.Error.Code);
    }

    [Fact]
    public async Task CreateProjectComment_WhenCharacterIsNotInRouteProject_RefusesTheTarget()
    {
        var projects = new Mock<IProjectRepository>();
        projects.Setup(r => r.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(Project.Create("Nightfall", null, Now));
        var comments = new Mock<IProjectCommentRepository>();
        comments.Setup(r => r.TargetExistsAsync(1, It.Is<ProjectCommentTarget>(t => t.CharacterId == 7 && t.Count == 1), It.IsAny<CancellationToken>()))
            .ReturnsAsync(false);
        var handler = new CreateProjectCommentCommandHandler(
            projects.Object,
            comments.Object,
            Clock(),
            new Mock<IUnitOfWork>().Object);

        var result = await handler.Handle(
            new CreateProjectCommentCommand(1, new ProjectCommentTarget(CharacterId: 7), "Weakness", "Fire breaks its guard.", false),
            CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("ProjectCommentTargetNotFound", result.Error.Code);
        Assert.Contains("Character 7", result.Error.Message);
    }

    [Fact]
    public async Task CreateProjectComment_WhenCharacterIsOwnedByRouteProject_PersistsTheTarget()
    {
        var projects = new Mock<IProjectRepository>();
        projects.Setup(r => r.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(Project.Create("Nightfall", null, Now));
        var comments = new Mock<IProjectCommentRepository>();
        comments.Setup(r => r.TargetExistsAsync(1, It.Is<ProjectCommentTarget>(t => t.CharacterId == 7 && t.Count == 1), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
        var handler = new CreateProjectCommentCommandHandler(
            projects.Object,
            comments.Object,
            Clock(),
            new Mock<IUnitOfWork>().Object);

        var result = await handler.Handle(
            new CreateProjectCommentCommand(1, new ProjectCommentTarget(CharacterId: 7), "Weakness", "Fire breaks its guard.", false),
            CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(7, result.Value.CharacterId);
        Assert.Equal("open", result.Value.Status);
        comments.Verify(r => r.AddAsync(It.Is<ProjectComment>(comment => comment.CharacterId == 7), It.IsAny<CancellationToken>()), Times.Once);
    }

    private static IDateTimeProvider Clock()
    {
        var clock = new Mock<IDateTimeProvider>();
        clock.SetupGet(c => c.UtcNow).Returns(Now);
        return clock.Object;
    }
}
