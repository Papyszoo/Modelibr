using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Models;
using Domain.Services;
using SharedKernel;

namespace Application.Packs;

internal class CreatePackCommandHandler : ICommandHandler<CreatePackCommand, CreatePackResponse>
{
    private readonly IPackRepository _packRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public CreatePackCommandHandler(
        IPackRepository packRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _packRepository = packRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result<CreatePackResponse>> Handle(CreatePackCommand command, CancellationToken cancellationToken)
    {
        try
        {
            // Check if a pack with the same name already exists
            var existingPack = await _packRepository.GetByNameAsync(command.Name, cancellationToken);
            if (existingPack != null)
            {
                return Result.Failure<CreatePackResponse>(
                    new Error("PackAlreadyExists", $"A pack with the name '{command.Name}' already exists."));
            }

            // Create new pack using domain factory method
            var pack = Pack.Create(command.Name, command.Description, _dateTimeProvider.UtcNow);

            var savedPack = await _packRepository.AddAsync(pack, cancellationToken);

            return Result.Success(new CreatePackResponse(savedPack.Id, savedPack.Name, savedPack.Description));
        }
        catch (ArgumentException ex)
        {
            return Result.Failure<CreatePackResponse>(
                new Error("PackCreationFailed", ex.Message));
        }
    }
}

public record CreatePackCommand(string Name, string? Description) : ICommand<CreatePackResponse>;
public record CreatePackResponse(int Id, string Name, string? Description);
