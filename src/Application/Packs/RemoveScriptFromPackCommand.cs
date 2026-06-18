using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.Packs;

internal class RemoveScriptFromPackCommandHandler : ICommandHandler<RemoveScriptFromPackCommand>
{
    private readonly IPackRepository _packRepository;
    private readonly IScriptRepository _scriptRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public RemoveScriptFromPackCommandHandler(
        IPackRepository packRepository,
        IScriptRepository scriptRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _packRepository = packRepository;
        _scriptRepository = scriptRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result> Handle(RemoveScriptFromPackCommand command, CancellationToken cancellationToken)
    {
        var pack = await _packRepository.GetByIdAsync(command.PackId, cancellationToken);
        if (pack == null)
        {
            return Result.Failure(
                new Error("PackNotFound", $"Pack with ID {command.PackId} was not found."));
        }

        var script = await _scriptRepository.GetByIdAsync(command.ScriptId, cancellationToken);
        if (script == null)
        {
            return Result.Failure(
                new Error("ScriptNotFound", $"Script with ID {command.ScriptId} was not found."));
        }

        pack.RemoveScript(script, _dateTimeProvider.UtcNow);

        await _packRepository.UpdateAsync(pack, cancellationToken);

        return Result.Success();
    }
}

public record RemoveScriptFromPackCommand(int PackId, int ScriptId) : ICommand;
