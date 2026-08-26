using Application.Abstractions;
using Application.Abstractions.Repositories;
using Application.Metadata;
using Application.Models;
using Application.Settings;
using Domain.Models;
using Domain.Services;
using Moq;
using Xunit;

namespace Application.Tests.Models;

public class ApplyImportAutomationCommandHandlerTests
{
    private static readonly DateTime Now = new(2026, 8, 24, 0, 0, 0, DateTimeKind.Utc);

    private readonly Mock<IModelRepository> _models = new();
    private readonly Mock<IModelCategoryRepository> _categories = new();
    private readonly Mock<IModelTagRepository> _tags = new();
    private readonly Mock<IAssetMetadataRepository> _metadata = new();
    private readonly Mock<IAssetSearchDocumentRepository> _searchDocuments = new();
    private readonly Mock<ISettingRepository> _settings = new();
    private readonly Mock<IUnitOfWork> _uow = new();
    private readonly ApplyImportAutomationCommandHandler _handler;

    private AssetMetadata? _saved;

    public ApplyImportAutomationCommandHandlerTests()
    {
        var clock = new Mock<IDateTimeProvider>();
        clock.Setup(c => c.UtcNow).Returns(Now);

        _categories.Setup(r => r.GetAllAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(Array.Empty<ModelCategory>());
        // Staged, not committed - which is what a repository does. The id stays 0 until
        // something calls SaveChangesAsync, exactly as EF leaves a temporary key.
        ModelCategory? pendingCategory = null;
        _categories.Setup(r => r.AddAsync(It.IsAny<ModelCategory>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((ModelCategory c, CancellationToken _) =>
            {
                pendingCategory = c;
                return c;
            });
        // A ROOT category goes in through AddRootAsync, which inserts and commits in one
        // step so it can catch the unique violation two concurrent imports produce. The id
        // is real by the time it returns - that is the whole reason it commits.
        _categories.Setup(r => r.AddRootAsync(It.IsAny<ModelCategory>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((ModelCategory c, CancellationToken _) =>
                new CategoryRootInsert<ModelCategory>(c.WithId(7), Created: true));
        _uow.Setup(u => u.SaveChangesAsync(It.IsAny<CancellationToken>()))
            .Callback(() =>
            {
                pendingCategory?.WithId(7);
                pendingCategory = null;
            })
            .Returns(Task.CompletedTask);
        _tags.Setup(r => r.GetByNormalizedNamesAsync(
                It.IsAny<IReadOnlyCollection<string>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Array.Empty<ModelTag>());
        _metadata.Setup(r => r.AddAsync(It.IsAny<AssetMetadata>(), It.IsAny<CancellationToken>()))
            .Callback((AssetMetadata m, CancellationToken _) => _saved = m)
            .Returns(Task.CompletedTask);
        _metadata.Setup(r => r.UpdateAsync(It.IsAny<AssetMetadata>(), It.IsAny<CancellationToken>()))
            .Callback((AssetMetadata m, CancellationToken _) => _saved = m)
            .Returns(Task.CompletedTask);

        _handler = new ApplyImportAutomationCommandHandler(
            _models.Object, _categories.Object, _tags.Object, _metadata.Object,
            _searchDocuments.Object, _settings.Object, clock.Object, _uow.Object);
    }

    private Model Given(string name, int? categoryId = null)
    {
        var model = Model.Create(name, Now).WithId(1);
        if (categoryId is { } id) model.AssignCategory(id, Now);
        _models.Setup(r => r.GetByIdAsync(1, It.IsAny<CancellationToken>())).ReturnsAsync(model);
        return model;
    }

    [Fact]
    public async Task Handle_Categorizes_From_The_Asset_Name()
    {
        var model = Given("SM_Bld_Apartment_01");

        var result = await _handler.Handle(
            new ApplyImportAutomationCommand(1), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.True(result.Value.Applied);
        Assert.Equal("Buildings", result.Value.CategoryName);
        Assert.Equal(7, model.ModelCategoryId);
    }

    /// <summary>
    /// Regression: a freshly created category's id is an EF temporary placeholder until
    /// something commits, and it is copied straight into two raw scalar FKs
    /// (`Model.ModelCategoryId`, `AssetMetadata.AutoCategoryId`) that EF will not fix up.
    /// Reading it before the commit assigned every such import to a category id that never
    /// existed.
    /// </summary>
    [Fact]
    public async Task Handle_Reads_A_New_Categorys_Id_Only_After_It_Is_Real()
    {
        var model = Given("Police_Car_01");

        var result = await _handler.Handle(
            new ApplyImportAutomationCommand(1), CancellationToken.None);

        Assert.Equal(7, result.Value.CategoryId);
        Assert.Equal(7, model.ModelCategoryId);
        Assert.Equal(7, _saved!.AutoCategoryId);
    }

    [Fact]
    public async Task Handle_Never_Overwrites_A_Category_The_Asset_Already_Has()
    {
        // A store import arrives with the manifest's category, and a user who set one has
        // said something a keyword map cannot improve on.
        var model = Given("SM_Bld_Apartment_01", categoryId: 42);

        var result = await _handler.Handle(
            new ApplyImportAutomationCommand(1), CancellationToken.None);

        Assert.Equal(42, model.ModelCategoryId);
        Assert.Null(result.Value.CategoryId);
        _categories.Verify(
            r => r.AddRootAsync(It.IsAny<ModelCategory>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Handle_Tags_From_The_Folder_And_Records_Which_Tags_It_Added()
    {
        var model = Given("asset_01");

        var result = await _handler.Handle(
            new ApplyImportAutomationCommand(1, "/library/Medieval/Barrels"),
            CancellationToken.None);

        Assert.Equal(new[] { "Barrels", "Medieval" }, result.Value.Tags);
        Assert.Equal(new[] { "Barrels", "Medieval" }, model.Tags.Select(t => t.Name));
        Assert.Equal(new[] { "Barrels", "Medieval" }, _saved!.AutoTags);
        Assert.Equal(Now, _saved.AutoAppliedAt);
        Assert.Null(_saved.AutoReviewedAt);
    }

    [Fact]
    public async Task Handle_Records_The_Folder_Even_When_It_Infers_Nothing()
    {
        Given("asset_01");

        var result = await _handler.Handle(
            new ApplyImportAutomationCommand(1, "/library/assets/models"),
            CancellationToken.None);

        Assert.False(result.Value.Applied);
        Assert.Equal("nothingInferred", result.Value.Reason);
        // The folder is provenance, not a guess - it is kept whether or not anything came
        // of it.
        Assert.Equal("/library/assets/models", _saved!.SourceFolder);
    }

    [Fact]
    public async Task Handle_Classifies_From_The_Naming_Convention_Its_Neighbours_Follow()
    {
        // The asset's own name says "wheel", which is nothing. Its neighbours say vehicle.
        var model = Given("SM_Veh_Wheel_03");

        var result = await _handler.Handle(
            new ApplyImportAutomationCommand(
                1,
                "/pack/Parts",
                new[] { "SM_Veh_Car_01.fbx", "SM_Veh_Truck_02.fbx", "SM_Veh_Bus_04.fbx" }),
            CancellationToken.None);

        Assert.Equal("Vehicles", result.Value.CategoryName);
        Assert.Equal(7, model.ModelCategoryId);
    }

    [Fact]
    public async Task Handle_Runs_Once_Per_Asset()
    {
        var model = Given("Sword");
        var already = AssetMetadata.Create("Model", 1, 1, Now);
        already.RecordAutoAssignment(new[] { "Weapons" }, 3, Now);
        _metadata.Setup(r => r.GetAsync("Model", 1, It.IsAny<CancellationToken>())).ReturnsAsync(already);

        var result = await _handler.Handle(
            new ApplyImportAutomationCommand(1), CancellationToken.None);

        // Its inputs cannot change after import, so a second run could only re-add tags a
        // user had deliberately removed.
        Assert.Equal("alreadyApplied", result.Value.Reason);
        Assert.Null(model.ModelCategoryId);
    }

    [Fact]
    public async Task Handle_Does_Nothing_When_The_Operator_Turned_It_Off()
    {
        var model = Given("Sword");
        _settings.Setup(r => r.GetByKeyAsync(SettingKeys.AutoAssignOnImport, It.IsAny<CancellationToken>()))
            .ReturnsAsync(Setting.Create(SettingKeys.AutoAssignOnImport, "false", Now));

        var result = await _handler.Handle(
            new ApplyImportAutomationCommand(1, "/library/Weapons"), CancellationToken.None);

        Assert.Equal("disabled", result.Value.Reason);
        Assert.Null(model.ModelCategoryId);
        Assert.Empty(model.Tags);
        // Still recorded: where a file came from is a fact, not a suggestion.
        Assert.Equal("/library/Weapons", _saved!.SourceFolder);
    }

    [Fact]
    public async Task Handle_Reuses_A_Category_The_Library_Already_Has()
    {
        var existing = ModelCategory.Create("Vehicles", null, null, Now).WithId(12);
        _categories.Setup(r => r.GetAllAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { existing });
        var model = Given("Police_Car_01");

        var result = await _handler.Handle(
            new ApplyImportAutomationCommand(1), CancellationToken.None);

        Assert.Equal(12, result.Value.CategoryId);
        Assert.Equal(12, model.ModelCategoryId);
        _categories.Verify(
            r => r.AddRootAsync(It.IsAny<ModelCategory>(), It.IsAny<CancellationToken>()), Times.Never);
    }
}
