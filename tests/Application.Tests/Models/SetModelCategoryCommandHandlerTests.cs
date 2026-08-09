using Application.Abstractions;
using Application.Abstractions.Repositories;
using Application.Models;
using Domain.Models;
using Domain.Services;
using Moq;
using Xunit;

namespace Application.Tests.Models;

public class SetModelCategoryCommandHandlerTests
{
    private static readonly DateTime Now = new(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);

    private readonly Mock<IModelRepository> _models = new();
    private readonly Mock<IModelCategoryRepository> _categories = new();
    private readonly Mock<IUnitOfWork> _uow = new();
    private readonly SetModelCategoryCommandHandler _handler;

    public SetModelCategoryCommandHandlerTests()
    {
        var clock = new Mock<IDateTimeProvider>();
        clock.Setup(c => c.UtcNow).Returns(Now);
        _handler = new SetModelCategoryCommandHandler(_models.Object, _categories.Object, clock.Object, _uow.Object);
    }

    [Fact]
    public async Task Handle_Assigns_Category_And_Saves()
    {
        var model = Model.Create("Sword", Now);
        _models.Setup(r => r.GetByIdAsync(1, It.IsAny<CancellationToken>())).ReturnsAsync(model);
        _categories.Setup(r => r.GetByIdAsync(5, It.IsAny<CancellationToken>()))
            .ReturnsAsync(ModelCategory.Create("Weapons", null, null, Now));

        var result = await _handler.Handle(new SetModelCategoryCommand(1, 5), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(5, result.Value.CategoryId);
        Assert.Equal(5, model.ModelCategoryId);
        _uow.Verify(u => u.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_Clears_Category_When_Null_Without_Category_Lookup()
    {
        var model = Model.Create("Sword", Now);
        model.AssignCategory(9, Now);
        _models.Setup(r => r.GetByIdAsync(1, It.IsAny<CancellationToken>())).ReturnsAsync(model);

        var result = await _handler.Handle(new SetModelCategoryCommand(1, null), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Null(result.Value.CategoryId);
        _categories.Verify(r => r.GetByIdAsync(It.IsAny<int>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Handle_Fails_When_Model_Missing()
    {
        _models.Setup(r => r.GetByIdAsync(1, It.IsAny<CancellationToken>())).ReturnsAsync((Model?)null);

        var result = await _handler.Handle(new SetModelCategoryCommand(1, 5), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("ModelNotFound", result.Error.Code);
    }

    [Fact]
    public async Task Handle_Fails_When_Category_Missing()
    {
        _models.Setup(r => r.GetByIdAsync(1, It.IsAny<CancellationToken>())).ReturnsAsync(Model.Create("Sword", Now));
        _categories.Setup(r => r.GetByIdAsync(5, It.IsAny<CancellationToken>())).ReturnsAsync((ModelCategory?)null);

        var result = await _handler.Handle(new SetModelCategoryCommand(1, 5), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("CategoryNotFound", result.Error.Code);
    }
}
