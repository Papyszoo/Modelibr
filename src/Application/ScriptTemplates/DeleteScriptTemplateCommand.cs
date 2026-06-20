using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.ScriptTemplates;

internal class DeleteScriptTemplateCommandHandler : ICommandHandler<DeleteScriptTemplateCommand>
{
    private readonly IScriptTemplateRepository _repository;

    public DeleteScriptTemplateCommandHandler(IScriptTemplateRepository repository)
    {
        _repository = repository;
    }

    public async Task<Result> Handle(DeleteScriptTemplateCommand command, CancellationToken cancellationToken)
    {
        var template = await _repository.GetByIdAsync(command.Id, cancellationToken);
        if (template == null)
        {
            return Result.Failure(
                new Error("ScriptTemplateNotFound", $"Script template with ID {command.Id} was not found."));
        }

        await _repository.DeleteAsync(command.Id, cancellationToken);
        return Result.Success();
    }
}

public record DeleteScriptTemplateCommand(int Id) : ICommand;
