using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.Scripts;

internal class SoftDeleteScriptCommandHandler : ICommandHandler<SoftDeleteScriptCommand>
{
    private readonly IScriptRepository _scriptRepository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IUnitOfWork _unitOfWork;

    public SoftDeleteScriptCommandHandler(
        IScriptRepository scriptRepository,
        IDateTimeProvider dateTimeProvider,
        IUnitOfWork unitOfWork)
    {
        _scriptRepository = scriptRepository;
        _dateTimeProvider = dateTimeProvider;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result> Handle(SoftDeleteScriptCommand command, CancellationToken cancellationToken)
    {
        var script = await _scriptRepository.GetByIdAsync(command.Id, cancellationToken);
        if (script == null)
        {
            return Result.Failure(
                new Error("ScriptNotFound", $"Script with ID {command.Id} not found."));
        }

        if (script.IsDeleted)
        {
            return Result.Failure(
                new Error("ScriptAlreadyDeleted", $"Script with ID {command.Id} is already deleted."));
        }

        script.SoftDelete(_dateTimeProvider.UtcNow);
        await _scriptRepository.UpdateAsync(script, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return Result.Success();
    }
}

public record SoftDeleteScriptCommand(int Id) : ICommand;
