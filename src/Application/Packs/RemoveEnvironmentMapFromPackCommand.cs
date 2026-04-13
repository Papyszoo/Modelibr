using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.Packs;

internal sealed class RemoveEnvironmentMapFromPackCommandHandler : ICommandHandler<RemoveEnvironmentMapFromPackCommand>
{
    private readonly IPackRepository _packRepository;
    private readonly IEnvironmentMapRepository _environmentMapRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public RemoveEnvironmentMapFromPackCommandHandler(
        IPackRepository packRepository,
        IEnvironmentMapRepository environmentMapRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _packRepository = packRepository;
        _environmentMapRepository = environmentMapRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result> Handle(RemoveEnvironmentMapFromPackCommand command, CancellationToken cancellationToken)
    {
        var pack = await _packRepository.GetByIdAsync(command.PackId, cancellationToken);
        if (pack == null)
            return Result.Failure(new Error("PackNotFound", $"Pack with ID {command.PackId} was not found."));

        var environmentMap = await _environmentMapRepository.GetByIdAsync(command.EnvironmentMapId, cancellationToken);
        if (environmentMap == null)
            return Result.Failure(new Error("EnvironmentMapNotFound", $"Environment map with ID {command.EnvironmentMapId} was not found."));

        pack.RemoveEnvironmentMap(environmentMap, _dateTimeProvider.UtcNow);
        await _packRepository.UpdateAsync(pack, cancellationToken);
        return Result.Success();
    }
}

public record RemoveEnvironmentMapFromPackCommand(int PackId, int EnvironmentMapId) : ICommand;
