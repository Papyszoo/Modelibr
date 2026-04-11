using Application.Abstractions.Repositories;
using Application.EnvironmentMapCategories;
using Application.Tests;
using Domain.Models;
using Domain.Services;
using Moq;
using Xunit;

namespace Application.Tests.Categories;

/// <summary>
/// Tests the shared generic category command logic via the concrete
/// EnvironmentMapCategory handlers, which are thin wrappers around
/// <see cref="Application.Categories.CategoryCommandHandlers"/>.
/// </summary>
public class CategoryCommandHandlerTests
{
    private readonly Mock<IEnvironmentMapCategoryRepository> _repository = new();
    private readonly Mock<IDateTimeProvider> _dateTimeProvider = new();
    private readonly DateTime _now = new(2025, 1, 15, 12, 0, 0, DateTimeKind.Utc);

    public CategoryCommandHandlerTests()
    {
        _dateTimeProvider.Setup(x => x.UtcNow).Returns(_now);
    }

    // ──────────────────────────────────────────────
    // CreateEnvironmentMapCategoryCommandHandler
    // ──────────────────────────────────────────────

    [Fact]
    public async Task Create_When_ValidName_Returns_Success_With_Dto()
    {
        _repository
            .Setup(x => x.GetByNameAsync("Outdoor", null, It.IsAny<CancellationToken>()))
            .ReturnsAsync((EnvironmentMapCategory?)null);

        _repository
            .Setup(x => x.AddAsync(It.IsAny<EnvironmentMapCategory>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((EnvironmentMapCategory cat, CancellationToken _) => cat.WithId(1));

        var handler = new CreateEnvironmentMapCategoryCommandHandler(
            _repository.Object, _dateTimeProvider.Object);

        var command = new CreateEnvironmentMapCategoryCommand("Outdoor", "Outdoor environments", null);

        var result = await handler.Handle(command, CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal("Outdoor", result.Value.Name);
        Assert.Equal("Outdoor environments", result.Value.Description);
        Assert.Null(result.Value.ParentId);
        _repository.Verify(x => x.AddAsync(It.IsAny<EnvironmentMapCategory>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Create_When_DuplicateNameInSameBranch_Returns_Failure_CategoryAlreadyExists()
    {
        var existing = EnvironmentMapCategory.Create("Outdoor", null, null, _now).WithId(5);

        _repository
            .Setup(x => x.GetByNameAsync("Outdoor", null, It.IsAny<CancellationToken>()))
            .ReturnsAsync(existing);

        var handler = new CreateEnvironmentMapCategoryCommandHandler(
            _repository.Object, _dateTimeProvider.Object);

        var command = new CreateEnvironmentMapCategoryCommand("Outdoor", null, null);

        var result = await handler.Handle(command, CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("CategoryAlreadyExists", result.Error.Code);
        _repository.Verify(x => x.AddAsync(It.IsAny<EnvironmentMapCategory>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Create_When_ParentIdProvided_Returns_Success()
    {
        _repository
            .Setup(x => x.GetByNameAsync("Sunset", 10, It.IsAny<CancellationToken>()))
            .ReturnsAsync((EnvironmentMapCategory?)null);

        _repository
            .Setup(x => x.AddAsync(It.IsAny<EnvironmentMapCategory>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((EnvironmentMapCategory cat, CancellationToken _) => cat.WithId(2));

        var handler = new CreateEnvironmentMapCategoryCommandHandler(
            _repository.Object, _dateTimeProvider.Object);

        var command = new CreateEnvironmentMapCategoryCommand("Sunset", null, 10);

        var result = await handler.Handle(command, CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal("Sunset", result.Value.Name);
        Assert.Equal(10, result.Value.ParentId);
    }

    // ──────────────────────────────────────────────
    // UpdateEnvironmentMapCategoryCommandHandler
    // ──────────────────────────────────────────────

    [Fact]
    public async Task Update_When_ExistingCategory_Returns_Success()
    {
        var category = EnvironmentMapCategory.Create("Indoor", "Indoor scenes", null, _now).WithId(1);

        _repository
            .Setup(x => x.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(category);

        _repository
            .Setup(x => x.GetByNameAsync("Interior", null, It.IsAny<CancellationToken>()))
            .ReturnsAsync((EnvironmentMapCategory?)null);

        _repository
            .Setup(x => x.UpdateAsync(It.IsAny<EnvironmentMapCategory>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);

        var handler = new UpdateEnvironmentMapCategoryCommandHandler(
            _repository.Object, _dateTimeProvider.Object);

        var command = new UpdateEnvironmentMapCategoryCommand(1, "Interior", "Interior scenes", null);

        var result = await handler.Handle(command, CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal("Interior", category.Name);
        Assert.Equal("Interior scenes", category.Description);
        _repository.Verify(x => x.UpdateAsync(category, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Update_When_CategoryNotFound_Returns_Failure_CategoryNotFound()
    {
        _repository
            .Setup(x => x.GetByIdAsync(999, It.IsAny<CancellationToken>()))
            .ReturnsAsync((EnvironmentMapCategory?)null);

        var handler = new UpdateEnvironmentMapCategoryCommandHandler(
            _repository.Object, _dateTimeProvider.Object);

        var command = new UpdateEnvironmentMapCategoryCommand(999, "Ghost", null, null);

        var result = await handler.Handle(command, CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("CategoryNotFound", result.Error.Code);
    }

    [Fact]
    public async Task Update_When_DuplicateName_Returns_Failure_CategoryAlreadyExists()
    {
        var category = EnvironmentMapCategory.Create("Indoor", null, null, _now).WithId(1);
        var sibling = EnvironmentMapCategory.Create("Outdoor", null, null, _now).WithId(2);

        _repository
            .Setup(x => x.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(category);

        _repository
            .Setup(x => x.GetByNameAsync("Outdoor", null, It.IsAny<CancellationToken>()))
            .ReturnsAsync(sibling);

        var handler = new UpdateEnvironmentMapCategoryCommandHandler(
            _repository.Object, _dateTimeProvider.Object);

        var command = new UpdateEnvironmentMapCategoryCommand(1, "Outdoor", null, null);

        var result = await handler.Handle(command, CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("CategoryAlreadyExists", result.Error.Code);
        _repository.Verify(x => x.UpdateAsync(It.IsAny<EnvironmentMapCategory>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Update_When_SelfParent_Returns_Failure_InvalidCategoryParent()
    {
        var category = EnvironmentMapCategory.Create("Outdoor", null, null, _now).WithId(5);

        _repository
            .Setup(x => x.GetByIdAsync(5, It.IsAny<CancellationToken>()))
            .ReturnsAsync(category);

        var handler = new UpdateEnvironmentMapCategoryCommandHandler(
            _repository.Object, _dateTimeProvider.Object);

        var command = new UpdateEnvironmentMapCategoryCommand(5, "Outdoor", null, 5);

        var result = await handler.Handle(command, CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("InvalidCategoryParent", result.Error.Code);
        _repository.Verify(x => x.UpdateAsync(It.IsAny<EnvironmentMapCategory>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Update_When_MoveUnderDescendant_Returns_Failure_InvalidCategoryParent()
    {
        // Tree: Root (10) -> Child (20) -> Grandchild (30)
        // Attempt: move Root (10) under Grandchild (30) — should fail
        var root = EnvironmentMapCategory.Create("Root", null, null, _now).WithId(10);
        var child = EnvironmentMapCategory.Create("Child", null, 10, _now).WithId(20);
        var grandchild = EnvironmentMapCategory.Create("Grandchild", null, 20, _now).WithId(30);

        var allCategories = new List<EnvironmentMapCategory> { root, child, grandchild };

        _repository
            .Setup(x => x.GetByIdAsync(10, It.IsAny<CancellationToken>()))
            .ReturnsAsync(root);

        _repository
            .Setup(x => x.GetAllAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(allCategories.AsReadOnly());

        var handler = new UpdateEnvironmentMapCategoryCommandHandler(
            _repository.Object, _dateTimeProvider.Object);

        var command = new UpdateEnvironmentMapCategoryCommand(10, "Root", null, 30);

        var result = await handler.Handle(command, CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("InvalidCategoryParent", result.Error.Code);
        _repository.Verify(x => x.UpdateAsync(It.IsAny<EnvironmentMapCategory>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    // ──────────────────────────────────────────────
    // DeleteEnvironmentMapCategoryCommandHandler
    // ──────────────────────────────────────────────

    [Fact]
    public async Task Delete_When_ExistingCategory_Returns_Success()
    {
        var category = EnvironmentMapCategory.Create("Outdoor", null, null, _now).WithId(1);

        _repository
            .Setup(x => x.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(category);

        _repository
            .Setup(x => x.DeleteAsync(It.IsAny<EnvironmentMapCategory>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);

        var handler = new DeleteEnvironmentMapCategoryCommandHandler(_repository.Object);

        var command = new DeleteEnvironmentMapCategoryCommand(1);

        var result = await handler.Handle(command, CancellationToken.None);

        Assert.True(result.IsSuccess);
        _repository.Verify(x => x.DeleteAsync(category, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Delete_When_CategoryNotFound_Returns_Failure_CategoryNotFound()
    {
        _repository
            .Setup(x => x.GetByIdAsync(999, It.IsAny<CancellationToken>()))
            .ReturnsAsync((EnvironmentMapCategory?)null);

        var handler = new DeleteEnvironmentMapCategoryCommandHandler(_repository.Object);

        var command = new DeleteEnvironmentMapCategoryCommand(999);

        var result = await handler.Handle(command, CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("CategoryNotFound", result.Error.Code);
        _repository.Verify(x => x.DeleteAsync(It.IsAny<EnvironmentMapCategory>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Delete_When_CategoryHasChildren_Returns_Failure_CategoryHasChildren()
    {
        var parent = EnvironmentMapCategory.Create("Outdoor", null, null, _now).WithId(1);
        var child = EnvironmentMapCategory.Create("Sunset", null, 1, _now).WithId(2);
        parent.Children = new List<EnvironmentMapCategory> { child };

        _repository
            .Setup(x => x.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(parent);

        var handler = new DeleteEnvironmentMapCategoryCommandHandler(_repository.Object);

        var command = new DeleteEnvironmentMapCategoryCommand(1);

        var result = await handler.Handle(command, CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("CategoryHasChildren", result.Error.Code);
        _repository.Verify(x => x.DeleteAsync(It.IsAny<EnvironmentMapCategory>(), It.IsAny<CancellationToken>()), Times.Never);
    }
}
