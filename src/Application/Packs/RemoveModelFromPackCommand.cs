using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.Packs;

internal class RemoveModelFromPackCommandHandler : ICommandHandler<RemoveModelFromPackCommand>
{
    private readonly IPackRepository _packRepository;
    private readonly IModelRepository _modelRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public RemoveModelFromPackCommandHandler(
        IPackRepository packRepository,
        IModelRepository modelRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _packRepository = packRepository;
        _modelRepository = modelRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result> Handle(RemoveModelFromPackCommand command, CancellationToken cancellationToken)
    {
        var pack = await _packRepository.GetByIdAsync(command.PackId, cancellationToken);
        if (pack == null)
        {
            return Result.Failure(
                new Error("PackNotFound", $"Pack with ID {command.PackId} was not found."));
        }

        var model = await _modelRepository.GetByIdAsync(command.ModelId, cancellationToken);
        if (model == null)
        {
            return Result.Failure(
                new Error("ModelNotFound", $"Model with ID {command.ModelId} was not found."));
        }

        pack.RemoveModel(model, _dateTimeProvider.UtcNow);

        await _packRepository.UpdateAsync(pack, cancellationToken);

        return Result.Success();
    }
}

public record RemoveModelFromPackCommand(int PackId, int ModelId) : ICommand;
