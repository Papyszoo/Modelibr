using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.EnvironmentMaps;

internal sealed class DeleteEnvironmentMapCommandHandler : ICommandHandler<DeleteEnvironmentMapCommand>
{
    private readonly IEnvironmentMapRepository _environmentMapRepository;

    public DeleteEnvironmentMapCommandHandler(IEnvironmentMapRepository environmentMapRepository)
    {
        _environmentMapRepository = environmentMapRepository;
    }

    public async Task<Result> Handle(DeleteEnvironmentMapCommand command, CancellationToken cancellationToken)
    {
        var environmentMap = await _environmentMapRepository.GetByIdAsync(command.Id, cancellationToken);
        if (environmentMap == null)
        {
            return Result.Failure(new Error("EnvironmentMapNotFound", $"Environment map with ID {command.Id} was not found."));
        }

        await _environmentMapRepository.DeleteAsync(command.Id, cancellationToken);
        return Result.Success();
    }
}

public record DeleteEnvironmentMapCommand(int Id) : ICommand;
