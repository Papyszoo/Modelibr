using Application.Abstractions;
using Application.Abstractions.Repositories;
using Application.Models;
using Domain.Models;
using Domain.Services;
using Moq;
using Xunit;

namespace Application.Tests.Models;

/// <summary>
/// The write behind <c>set_tags</c> and the tag editor. What is worth pinning here is not
/// that tags are stored - it is that search learns about them in the same transaction.
/// Search reads projection state only, so a tag the projection never heard about is a tag
/// nobody can find the model by.
/// </summary>
public class UpdateModelTagsCommandHandlerTests
{
    private static readonly DateTime Now = new(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);

    private readonly Mock<IModelRepository> _models = new();
    private readonly Mock<IModelTagRepository> _tags = new();
    private readonly Mock<IModelCategoryRepository> _categories = new();
    private readonly Mock<IAssetSearchDocumentRepository> _searchDocuments = new();
    private readonly Mock<IUnitOfWork> _uow = new();
    private readonly UpdateModelTagsCommandHandler _handler;

    public UpdateModelTagsCommandHandlerTests()
    {
        var clock = new Mock<IDateTimeProvider>();
        clock.Setup(c => c.UtcNow).Returns(Now);

        _tags.Setup(r => r.GetByNormalizedNamesAsync(It.IsAny<string[]>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Array.Empty<ModelTag>());

        _handler = new UpdateModelTagsCommandHandler(
            _models.Object, _tags.Object, _categories.Object, _searchDocuments.Object,
            clock.Object, _uow.Object);
    }

    [Fact]
    public async Task Handle_Mirrors_Tags_And_Description_Onto_The_Search_Projection()
    {
        // The loop this closes: a user labels a model "rustic oak dining chair" and could
        // not then retrieve it by any of those words, because nothing ever wrote them
        // anywhere search reads.
        var model = Model.Create("Chair", Now).WithId(1);
        _models.Setup(r => r.GetByIdAsync(1, It.IsAny<CancellationToken>())).ReturnsAsync(model);

        var result = await _handler.Handle(
            new UpdateModelTagsCommand(1, new[] { "oak", "rustic" }, "A rustic oak dining chair.", null),
            CancellationToken.None);

        Assert.True(result.IsSuccess);
        _searchDocuments.Verify(
            r => r.SetMetadataForAssetAsync(
                "Model",
                1,
                It.Is<IEnumerable<string>>(t => t.Contains("oak") && t.Contains("rustic")),
                "A rustic oak dining chair.",
                It.IsAny<CancellationToken>()),
            Times.Once);
        _uow.Verify(u => u.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_Mirrors_The_Category_The_Way_SetModelCategory_Does()
    {
        // This command also assigns a category, and used not to mirror it - so the two
        // ways to set a category left search reporting different things.
        var model = Model.Create("Chair", Now).WithId(1);
        _models.Setup(r => r.GetByIdAsync(1, It.IsAny<CancellationToken>())).ReturnsAsync(model);
        _categories.Setup(r => r.GetByIdAsync(5, It.IsAny<CancellationToken>()))
            .ReturnsAsync(ModelCategory.Create("Furniture", null, null, Now));

        await _handler.Handle(
            new UpdateModelTagsCommand(1, Array.Empty<string>(), null, 5), CancellationToken.None);

        _searchDocuments.Verify(
            r => r.SetCategoryForAssetAsync("Model", 1, 5, "Furniture", It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task Handle_When_The_Category_Does_Not_Exist_Touches_Nothing()
    {
        var model = Model.Create("Chair", Now).WithId(1);
        _models.Setup(r => r.GetByIdAsync(1, It.IsAny<CancellationToken>())).ReturnsAsync(model);
        _categories.Setup(r => r.GetByIdAsync(5, It.IsAny<CancellationToken>()))
            .ReturnsAsync((ModelCategory?)null);

        var result = await _handler.Handle(
            new UpdateModelTagsCommand(1, new[] { "oak" }, null, 5), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("CategoryNotFound", result.Error.Code);
        _searchDocuments.VerifyNoOtherCalls();
        _uow.Verify(u => u.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Never);
    }
}
