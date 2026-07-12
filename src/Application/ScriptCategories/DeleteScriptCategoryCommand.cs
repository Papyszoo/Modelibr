using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Categories;
using SharedKernel;

namespace Application.ScriptCategories;

internal class DeleteScriptCategoryCommandHandler : ICommandHandler<DeleteScriptCategoryCommand>
{
    private readonly IScriptCategoryRepository _categoryRepository;
    private readonly IUnitOfWork _unitOfWork;

    public DeleteScriptCategoryCommandHandler(IScriptCategoryRepository categoryRepository, IUnitOfWork unitOfWork)
    {
        _categoryRepository = categoryRepository;
        _unitOfWork = unitOfWork;
    }

    public Task<Result> Handle(DeleteScriptCategoryCommand command, CancellationToken cancellationToken)
        => CategoryCommandHandlers.DeleteAsync(
            _categoryRepository, command.Id, "Script category", _unitOfWork, cancellationToken);
}

public record DeleteScriptCategoryCommand(int Id) : ICommand;
