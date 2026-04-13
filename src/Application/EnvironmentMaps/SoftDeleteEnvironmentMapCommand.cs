using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.EnvironmentMaps;

internal sealed class SoftDeleteEnvironmentMapCommandHandler : ICommandHandler<SoftDeleteEnvironmentMapCommand>
{
    private readonly IEnvironmentMapRepository _environmentMapRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public SoftDeleteEnvironmentMapCommandHandler(
        IEnvironmentMapRepository environmentMapRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _environmentMapRepository = environmentMapRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result> Handle(SoftDeleteEnvironmentMapCommand command, CancellationToken cancellationToken)
    {
        var environmentMap = await _environmentMapRepository.GetByIdAsync(command.Id, cancellationToken);
        if (environmentMap == null)
        {
            return Result.Failure(new Error("EnvironmentMapNotFound", $"Environment map with ID {command.Id} was not found."));
        }

        if (environmentMap.IsDeleted)
        {
            return Result.Failure(new Error("EnvironmentMapAlreadyDeleted", $"Environment map with ID {command.Id} is already deleted."));
        }

        environmentMap.SoftDelete(_dateTimeProvider.UtcNow);
        await _environmentMapRepository.UpdateAsync(environmentMap, cancellationToken);
        return Result.Success();
    }
}

public record SoftDeleteEnvironmentMapCommand(int Id) : ICommand;
