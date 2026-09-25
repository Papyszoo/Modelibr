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
    public void ProductionNote_Create_AllowsNoTargetForAProjectNote()
    {
        var note = ProductionNote.Create(1, null, null, "North star", "Keep the opening readable.", true, Now);

        Assert.Null(note.LevelId);
        Assert.Null(note.ReferenceImageId);
        Assert.True(note.IsPinned);
    }

    [Fact]
    public void ProductionNote_Create_WhenBothTargetsArePresent_Throws()
    {
        Assert.Throws<ArgumentException>(() =>
            ProductionNote.Create(1, 2, 3, "Conflict", "A note has one target.", false, Now));
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
