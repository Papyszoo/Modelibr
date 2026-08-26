using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.EnvironmentMaps;

internal sealed class DeleteEnvironmentMapCommandHandler : ICommandHandler<DeleteEnvironmentMapCommand>
{
    private readonly IEnvironmentMapRepository _environmentMapRepository;
    private readonly IStoreImportedItemRepository _storeImportedItemRepository;
    private readonly IUnitOfWork _unitOfWork;

    public DeleteEnvironmentMapCommandHandler(
        IEnvironmentMapRepository environmentMapRepository,
        IStoreImportedItemRepository storeImportedItemRepository,
        IUnitOfWork unitOfWork)
    {
        _environmentMapRepository = environmentMapRepository;
        _storeImportedItemRepository = storeImportedItemRepository;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result> Handle(DeleteEnvironmentMapCommand command, CancellationToken cancellationToken)
    {
        var environmentMap = await _environmentMapRepository.GetByIdAsync(command.Id, cancellationToken);
        if (environmentMap == null)
        {
            return Result.Failure(new Error("EnvironmentMapNotFound", $"Environment map with ID {command.Id} was not found."));
        }

        await _storeImportedItemRepository.DeleteByAssetAsync("EnvironmentMap", command.Id, cancellationToken);
        await _environmentMapRepository.DeleteAsync(command.Id, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}

public record DeleteEnvironmentMapCommand(int Id) : ICommand;
