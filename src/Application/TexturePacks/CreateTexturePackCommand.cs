using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Models;
using Domain.Services;
using SharedKernel;

namespace Application.TexturePacks;

internal class CreateTexturePackCommandHandler : ICommandHandler<CreateTexturePackCommand, CreateTexturePackResponse>
{
    private readonly ITexturePackRepository _texturePackRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public CreateTexturePackCommandHandler(
        ITexturePackRepository texturePackRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _texturePackRepository = texturePackRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result<CreateTexturePackResponse>> Handle(CreateTexturePackCommand command, CancellationToken cancellationToken)
    {
        try
        {
            // Check if a texture pack with the same name already exists
            var existingTexturePack = await _texturePackRepository.GetByNameAsync(command.Name, cancellationToken);
            if (existingTexturePack != null)
            {
                return Result.Failure<CreateTexturePackResponse>(
                    new Error("TexturePackAlreadyExists", $"A texture pack with the name '{command.Name}' already exists."));
            }

            // Create new texture pack using domain factory method
            var texturePack = TexturePack.Create(command.Name, _dateTimeProvider.UtcNow);

            var savedTexturePack = await _texturePackRepository.AddAsync(texturePack, cancellationToken);

            return Result.Success(new CreateTexturePackResponse(savedTexturePack.Id, savedTexturePack.Name));
        }
        catch (ArgumentException ex)
        {
            return Result.Failure<CreateTexturePackResponse>(
                new Error("TexturePackCreationFailed", ex.Message));
        }
    }
}

public record CreateTexturePackCommand(string Name) : ICommand<CreateTexturePackResponse>;
public record CreateTexturePackResponse(int Id, string Name);