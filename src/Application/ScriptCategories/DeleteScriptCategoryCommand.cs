using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Categories;
using SharedKernel;

namespace Application.ScriptCategories;

internal class DeleteScriptCategoryCommandHandler : ICommandHandler<DeleteScriptCategoryCommand>
{
    private readonly IScriptCategoryRepository _categoryRepository;

    public DeleteScriptCategoryCommandHandler(IScriptCategoryRepository categoryRepository)
    {
        _categoryRepository = categoryRepository;
    }

    public Task<Result> Handle(DeleteScriptCategoryCommand command, CancellationToken cancellationToken)
        => CategoryCommandHandlers.DeleteAsync(
            _categoryRepository, command.Id, "Script category", cancellationToken);
}

public record DeleteScriptCategoryCommand(int Id) : ICommand;
