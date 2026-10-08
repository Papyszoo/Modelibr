using Domain.Models;
using Domain.Projects;
using Xunit;

namespace Domain.Tests.Unit;

public class ProjectStudioDomainTests
{
    private static readonly DateTime Now = new(2026, 9, 25, 0, 0, 0, DateTimeKind.Utc);

    [Fact]
    public void ProjectLevel_Create_NormalizesTheFixedProductionStatus()
    {
        var level = ProjectLevel.Create(1, " Forest Crossing ", "Build the crossing", "IN_PROGRESS", 2, Now);

        Assert.Equal("Forest Crossing", level.Name);
        Assert.Equal(ProjectLevelStatuses.InProgress, level.ProductionStatus);
        Assert.Equal(2, level.SortOrder);
    }

    [Fact]
    public void ProjectLevel_Create_WhenStatusIsUnknown_Throws()
    {
        Assert.Throws<ArgumentException>(() =>
            ProjectLevel.Create(1, "Forest", null, "shipping", 0, Now));
    }

    [Fact]
    public void ProjectComment_Create_AllowsNoTargetForAProjectComment()
    {
        var comment = ProjectComment.Create(1, ProjectCommentTarget.None, "North star", "Keep the opening readable.", true, Now);

        Assert.Null(comment.LevelId);
        Assert.Null(comment.ReferenceImageId);
        Assert.True(comment.IsPinned);
        Assert.Equal(ProjectCommentStatuses.Open, comment.Status);
        Assert.Null(comment.Resolution);
    }

    [Fact]
    public void ProjectCharacter_Create_ValidatesIdentityAndNormalizesEnemyTagContext()
    {
        var enemy = ProjectCharacterTag.Create(1, " Enemy ", Now);
        var duplicateEnemy = ProjectCharacterTag.Create(1, "ENEMY", Now);

        var character = ProjectCharacter.Create(1, " Ashen Warden ", "A firebound guardian.", Now, new[] { enemy, duplicateEnemy });

        Assert.Equal("Ashen Warden", character.Name);
        Assert.Single(character.Tags);
        Assert.True(character.IsEnemy);
        Assert.Throws<ArgumentException>(() => ProjectCharacter.Create(1, " ", null, Now));
        Assert.Throws<ArgumentException>(() => ProjectCharacter.Create(1, "Ashen Warden", new string('x', 2001), Now));
    }

    [Fact]
    public void ProjectComment_Create_CanTargetACharacter()
    {
        var comment = ProjectComment.Create(1, new ProjectCommentTarget(CharacterId: 7), "Weakness", "Fire breaks its guard.", false, Now);

        Assert.Equal(7, comment.CharacterId);
        Assert.Null(comment.LevelId);
        Assert.Null(comment.ReferenceImageId);
    }

    [Fact]
    public void ProjectComment_Create_WhenCharacterAndAnotherTargetArePresent_Throws()
    {
        Assert.Throws<ArgumentException>(() =>
            ProjectComment.Create(1, new ProjectCommentTarget(LevelId: 2, CharacterId: 3), "Conflict", "A comment has one target.", false, Now));
    }

    [Fact]
    public void ProjectComment_Create_WhenLevelAndReferenceAreBothTargets_Throws()
    {
        Assert.Throws<ArgumentException>(() =>
            ProjectComment.Create(1, new ProjectCommentTarget(LevelId: 2, ReferenceImageId: 3), "Conflict", "A comment has one target.", false, Now));
    }

    // Each library asset kind is a target of its own; a regression that dropped one from
    // the target would silently turn an asset comment into a project-wide one.
    [Theory]
    [InlineData("model")]
    [InlineData("textureSet")]
    [InlineData("sprite")]
    [InlineData("sound")]
    [InlineData("environmentMap")]
    [InlineData("vfx")]
    public void ProjectComment_Create_CanTargetEachAssetKind(string kind)
    {
        var target = kind switch
        {
            "model" => new ProjectCommentTarget(ModelId: 5),
            "textureSet" => new ProjectCommentTarget(TextureSetId: 5),
            "sprite" => new ProjectCommentTarget(SpriteId: 5),
            "sound" => new ProjectCommentTarget(SoundId: 5),
            "environmentMap" => new ProjectCommentTarget(EnvironmentMapId: 5),
            _ => new ProjectCommentTarget(VfxId: 5),
        };

        var comment = ProjectComment.Create(1, target, "Scale", "Twice too large next to the door.", false, Now);

        Assert.Equal(target, comment.Target);
        Assert.Equal(1, comment.Target.Count);
    }

    [Fact]
    public void ProjectComment_Create_WhenAnAssetAndALevelAreBothTargets_Throws()
    {
        Assert.Throws<ArgumentException>(() =>
            ProjectComment.Create(1, new ProjectCommentTarget(LevelId: 2, VfxId: 3), "Conflict", "A comment has one target.", false, Now));
    }

    [Fact]
    public void ProjectComment_SetStatus_ResolvesWithAResolutionAndReopenClearsIt()
    {
        var comment = ProjectComment.Create(1, new ProjectCommentTarget(ModelId: 5), "Scale", "Too large.", false, Now);
        var later = Now.AddHours(1);

        comment.SetStatus("Resolved", "  Scaled down to 0.5.  ", later);

        Assert.Equal(ProjectCommentStatuses.Resolved, comment.Status);
        Assert.Equal("Scaled down to 0.5.", comment.Resolution);
        Assert.Equal(later, comment.UpdatedAt);

        comment.SetStatus(ProjectCommentStatuses.Open, null, later);

        Assert.Equal(ProjectCommentStatuses.Open, comment.Status);
        Assert.Null(comment.Resolution);
    }

    [Fact]
    public void ProjectComment_SetStatus_ResolvesWithoutAResolution()
    {
        var comment = ProjectComment.Create(1, ProjectCommentTarget.None, "Scale", "Too large.", false, Now);

        comment.SetStatus(ProjectCommentStatuses.Resolved, "   ", Now);

        Assert.Equal(ProjectCommentStatuses.Resolved, comment.Status);
        Assert.Null(comment.Resolution);
    }

    [Fact]
    public void ProjectComment_SetStatus_RefusesAResolutionOnAnOpenComment()
    {
        var comment = ProjectComment.Create(1, ProjectCommentTarget.None, "Scale", "Too large.", false, Now);

        Assert.Throws<ArgumentException>(() => comment.SetStatus(ProjectCommentStatuses.Open, "Done", Now));
        Assert.Throws<ArgumentException>(() => comment.SetStatus("archived", null, Now));
        Assert.Equal(ProjectCommentStatuses.Open, comment.Status);
    }

    [Fact]
    public void Scene_SetLevel_ChangesTheLevelAndBumpsTheRevision()
    {
        var scene = Scene.Create("Crossing", "{\"schemaVersion\":1}", 1, Now, projectId: 1).Value;
        var revision = scene.Revision;

        scene.SetLevel(2, isPrimary: true, Now.AddMinutes(1));

        Assert.Equal(2, scene.ProjectLevelId);
        Assert.True(scene.IsPrimaryLevelScene);
        Assert.Equal(revision + 1, scene.Revision);
    }

    [Fact]
    public void Scene_SetLevel_WhenUnlinked_CannotRemainPrimary()
    {
        var scene = Scene.Create("Crossing", "{\"schemaVersion\":1}", 1, Now, projectId: 1).Value;

        Assert.Throws<ArgumentException>(() => scene.SetLevel(null, isPrimary: true, Now));
    }
}
