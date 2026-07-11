using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Categories;
using Domain.Services;
using SharedKernel;

namespace Application.ScriptCategories;

internal class UpdateScriptCategoryCommandHandler : ICommandHandler<UpdateScriptCategoryCommand>
{
    private readonly IScriptCategoryRepository _categoryRepository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IUnitOfWork _unitOfWork;

    public UpdateScriptCategoryCommandHandler(
        IScriptCategoryRepository categoryRepository,
        IDateTimeProvider dateTimeProvider,
        IUnitOfWork unitOfWork)
    {
        _categoryRepository = categoryRepository;
        _dateTimeProvider = dateTimeProvider;
        _unitOfWork = unitOfWork;
    }

    public Task<Result> Handle(UpdateScriptCategoryCommand command, CancellationToken cancellationToken)
        => CategoryCommandHandlers.UpdateAsync(
            _categoryRepository, command.Id, command.Name, command.Description, command.ParentId,
            "Script category", _dateTimeProvider.UtcNow, _unitOfWork, cancellationToken);
}

public record UpdateScriptCategoryCommand(int Id, string Name, string? Description = null, int? ParentId = null) : ICommand;
