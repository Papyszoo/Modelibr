using Application.Abstractions;
using Application.Abstractions.Repositories;
using Application.Metadata;
using Domain.Models;
using Domain.Services;
using Moq;
using Xunit;

namespace Application.Tests.Metadata;

public class ReviewImportSuggestionsCommandHandlerTests
{
    private static readonly DateTime Now = new(2026, 8, 24, 0, 0, 0, DateTimeKind.Utc);

    private readonly Mock<IAssetMetadataRepository> _metadata = new();
    private readonly Mock<IModelRepository> _models = new();
    private readonly Mock<IAssetSearchDocumentRepository> _searchDocuments = new();
    private readonly Mock<IUnitOfWork> _uow = new();
    private readonly ReviewImportSuggestionsCommandHandler _handler;

    public ReviewImportSuggestionsCommandHandlerTests()
    {
        var clock = new Mock<IDateTimeProvider>();
        clock.Setup(c => c.UtcNow).Returns(Now);
        _metadata.Setup(r => r.GetPendingAutoReviewAsync(
                It.IsAny<string>(), It.IsAny<int>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Array.Empty<AssetMetadata>() as IReadOnlyList<AssetMetadata>, 0));

        _handler = new ReviewImportSuggestionsCommandHandler(
            _metadata.Object, _models.Object, _searchDocuments.Object, clock.Object, _uow.Object);
    }

    /// <summary>A model that the automation categorized and tagged, and its metadata row.</summary>
    private (Model Model, AssetMetadata Row) Guessed(string tagName = "Barrels", int categoryId = 7)
    {
        var model = Model.Create("asset_01", Now).WithId(1);
        model.AssignCategory(categoryId, Now);
        model.SetMetadata(new[] { ModelTag.Create(tagName, Now) }, null, Now);

        var row = AssetMetadata.Create("Model", 1, 1, Now);
        row.RecordAutoAssignment(new[] { tagName }, categoryId, Now);

        _metadata.Setup(r => r.GetPendingAutoReviewByIdsAsync(
                "Model", It.IsAny<IReadOnlyCollection<int>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { row });
        _models.Setup(r => r.GetByIdAsync(1, It.IsAny<CancellationToken>())).ReturnsAsync(model);

        return (model, row);
    }

    [Fact]
    public async Task Handle_Accept_Marks_Reviewed_And_Keeps_Everything()
    {
        var (model, row) = Guessed();

        var result = await _handler.Handle(
            new ReviewImportSuggestionsCommand(new[] { 1 }, Accept: true), CancellationToken.None);

        Assert.Equal(1, result.Value.Reviewed);
        Assert.Equal(0, result.Value.CategoriesCleared);
        Assert.Equal(Now, row.AutoReviewedAt);
        Assert.Equal(7, model.ModelCategoryId);
        Assert.Single(model.Tags);
    }

    [Fact]
    public async Task Handle_Reject_Takes_Back_What_The_Automation_Applied()
    {
        var (model, row) = Guessed();

        var result = await _handler.Handle(
            new ReviewImportSuggestionsCommand(new[] { 1 }, Accept: false), CancellationToken.None);

        Assert.Equal(1, result.Value.CategoriesCleared);
        Assert.Equal(1, result.Value.TagsRemoved);
        Assert.Null(model.ModelCategoryId);
        Assert.Empty(model.Tags);
        Assert.Equal(Now, row.AutoReviewedAt);

        // Search reads the projection, so an undo that only touched the aggregate would
        // leave the asset filterable by a category it no longer has.
        _searchDocuments.Verify(
            r => r.SetCategoryForAssetAsync("Model", 1, null, null, It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task Handle_Reject_Leaves_A_Decision_A_Person_Made_Since()
    {
        var (model, _) = Guessed();
        // Someone re-categorised it and added a tag of their own after the import.
        model.AssignCategory(99, Now);
        model.SetMetadata(
            model.Tags.Concat(new[] { ModelTag.Create("Hero Prop", Now) }).ToList(), null, Now);

        var result = await _handler.Handle(
            new ReviewImportSuggestionsCommand(new[] { 1 }, Accept: false), CancellationToken.None);

        Assert.Equal(0, result.Value.CategoriesCleared);
        Assert.Equal(99, model.ModelCategoryId);
        // Only the guessed tag goes; theirs stays.
        Assert.Equal(new[] { "Hero Prop" }, model.Tags.Select(t => t.Name));
        Assert.Equal(1, result.Value.TagsRemoved);
    }

    [Fact]
    public async Task Handle_With_No_Ids_Settles_A_Bounded_Batch_And_Reports_What_Is_Left()
    {
        var (_, row) = Guessed();
        _metadata.Setup(r => r.GetPendingAutoReviewAsync(
                "Model", 1, It.Is<int>(size => size > 1), It.IsAny<CancellationToken>()))
            .ReturnsAsync((new[] { row } as IReadOnlyList<AssetMetadata>, 1));
        _metadata.Setup(r => r.GetPendingAutoReviewAsync(
                "Model", 1, 1, It.IsAny<CancellationToken>()))
            .ReturnsAsync((Array.Empty<AssetMetadata>() as IReadOnlyList<AssetMetadata>, 4));

        var result = await _handler.Handle(
            new ReviewImportSuggestionsCommand(null, Accept: true), CancellationToken.None);

        Assert.Equal(1, result.Value.Reviewed);
        // A whole-library reject is bounded per call, so the caller repeats while this is
        // above zero rather than waiting on a request that never returns.
        Assert.Equal(4, result.Value.Remaining);
    }
}
