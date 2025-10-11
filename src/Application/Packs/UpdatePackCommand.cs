using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.Packs;

internal class UpdatePackCommandHandler : ICommandHandler<UpdatePackCommand>
{
    private readonly IPackRepository _packRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public UpdatePackCommandHandler(
        IPackRepository packRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _packRepository = packRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result> Handle(UpdatePackCommand command, CancellationToken cancellationToken)
    {
        try
        {
            var pack = await _packRepository.GetByIdAsync(command.Id, cancellationToken);
            if (pack == null)
            {
                return Result.Failure(
                    new Error("PackNotFound", $"Pack with ID {command.Id} was not found."));
            }

            // Check if another pack with the same name exists (excluding current pack)
            var existingPack = await _packRepository.GetByNameAsync(command.Name, cancellationToken);
            if (existingPack != null && existingPack.Id != command.Id)
            {
                return Result.Failure(
                    new Error("PackAlreadyExists", $"A pack with the name '{command.Name}' already exists."));
            }

            pack.Update(command.Name, command.Description, _dateTimeProvider.UtcNow);

            await _packRepository.UpdateAsync(pack, cancellationToken);

            return Result.Success();
        }
        catch (ArgumentException ex)
        {
            return Result.Failure(
                new Error("PackUpdateFailed", ex.Message));
        }
    }
}

public record UpdatePackCommand(int Id, string Name, string? Description) : ICommand;
