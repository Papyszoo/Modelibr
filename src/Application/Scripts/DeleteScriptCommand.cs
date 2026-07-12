using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.Scripts;

internal class DeleteScriptCommandHandler : ICommandHandler<DeleteScriptCommand>
{
    private readonly IScriptRepository _scriptRepository;
    private readonly IUnitOfWork _unitOfWork;

    public DeleteScriptCommandHandler(IScriptRepository scriptRepository, IUnitOfWork unitOfWork)
    {
        _scriptRepository = scriptRepository;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result> Handle(DeleteScriptCommand command, CancellationToken cancellationToken)
    {
        var script = await _scriptRepository.GetByIdAsync(command.Id, cancellationToken);
        if (script == null)
        {
            return Result.Failure(
                new Error("ScriptNotFound", $"Script with ID {command.Id} not found."));
        }

        await _scriptRepository.DeleteAsync(command.Id, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return Result.Success();
    }
}

public record DeleteScriptCommand(int Id) : ICommand;
