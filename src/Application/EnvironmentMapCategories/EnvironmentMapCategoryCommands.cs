using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Categories;
using Domain.Models;
using Domain.Services;
using SharedKernel;

namespace Application.EnvironmentMapCategories;

internal sealed class CreateEnvironmentMapCategoryCommandHandler : ICommandHandler<CreateEnvironmentMapCategoryCommand, EnvironmentMapCategorySummaryDto>
{
    private readonly IEnvironmentMapCategoryRepository _categoryRepository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IUnitOfWork _unitOfWork;

    public CreateEnvironmentMapCategoryCommandHandler(
        IEnvironmentMapCategoryRepository categoryRepository,
        IDateTimeProvider dateTimeProvider,
        IUnitOfWork unitOfWork)
    {
        _categoryRepository = categoryRepository;
        _dateTimeProvider = dateTimeProvider;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result<EnvironmentMapCategorySummaryDto>> Handle(CreateEnvironmentMapCategoryCommand command, CancellationToken cancellationToken)
    {
        var result = await CategoryCommandHandlers.CreateAsync(
            _categoryRepository, command.Name, command.Description, command.ParentId,
            "environment map category", EnvironmentMapCategory.Create, _dateTimeProvider.UtcNow, _unitOfWork, cancellationToken);

        return result.IsSuccess
            ? Result.Success(new EnvironmentMapCategorySummaryDto
            {
                Id = result.Value.Id,
                Name = result.Value.Name,
                Description = result.Value.Description,
                ParentId = result.Value.ParentId,
                Path = result.Value.Path
            })
            : Result.Failure<EnvironmentMapCategorySummaryDto>(result.Error);
    }
}

internal sealed class UpdateEnvironmentMapCategoryCommandHandler : ICommandHandler<UpdateEnvironmentMapCategoryCommand>
{
    private readonly IEnvironmentMapCategoryRepository _categoryRepository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IUnitOfWork _unitOfWork;

    public UpdateEnvironmentMapCategoryCommandHandler(
        IEnvironmentMapCategoryRepository categoryRepository,
        IDateTimeProvider dateTimeProvider,
        IUnitOfWork unitOfWork)
    {
        _categoryRepository = categoryRepository;
        _dateTimeProvider = dateTimeProvider;
        _unitOfWork = unitOfWork;
    }

    public Task<Result> Handle(UpdateEnvironmentMapCategoryCommand command, CancellationToken cancellationToken)
        => CategoryCommandHandlers.UpdateAsync(
            _categoryRepository, command.Id, command.Name, command.Description, command.ParentId,
            "Environment map category", _dateTimeProvider.UtcNow, _unitOfWork, cancellationToken);
}

internal sealed class DeleteEnvironmentMapCategoryCommandHandler : ICommandHandler<DeleteEnvironmentMapCategoryCommand>
{
    private readonly IEnvironmentMapCategoryRepository _categoryRepository;
    private readonly IUnitOfWork _unitOfWork;

    public DeleteEnvironmentMapCategoryCommandHandler(IEnvironmentMapCategoryRepository categoryRepository, IUnitOfWork unitOfWork)
    {
        _categoryRepository = categoryRepository;
        _unitOfWork = unitOfWork;
    }

    public Task<Result> Handle(DeleteEnvironmentMapCategoryCommand command, CancellationToken cancellationToken)
        => CategoryCommandHandlers.DeleteAsync(
            _categoryRepository, command.Id, "Environment map category", _unitOfWork, cancellationToken);
}

public record CreateEnvironmentMapCategoryCommand(string Name, string? Description, int? ParentId) : ICommand<EnvironmentMapCategorySummaryDto>;
public record UpdateEnvironmentMapCategoryCommand(int Id, string Name, string? Description, int? ParentId) : ICommand;
public record DeleteEnvironmentMapCategoryCommand(int Id) : ICommand;
