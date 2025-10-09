using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.TextureSets;

internal class UpdateTextureSetCommandHandler : ICommandHandler<UpdateTextureSetCommand, UpdateTextureSetResponse>
{
    private readonly ITextureSetRepository _textureSetRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public UpdateTextureSetCommandHandler(
        ITextureSetRepository textureSetRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _textureSetRepository = textureSetRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result<UpdateTextureSetResponse>> Handle(UpdateTextureSetCommand command, CancellationToken cancellationToken)
    {
        try
        {
            var textureSet = await _textureSetRepository.GetByIdAsync(command.Id, cancellationToken);
            if (textureSet == null)
            {
                return Result.Failure<UpdateTextureSetResponse>(
                    new Error("TextureSetNotFound", $"Texture set with ID {command.Id} was not found."));
            }

            // Check if another texture set with the same name already exists (excluding current one)
            var existingTextureSet = await _textureSetRepository.GetByNameAsync(command.Name, cancellationToken);
            if (existingTextureSet != null && existingTextureSet.Id != command.Id)
            {
                return Result.Failure<UpdateTextureSetResponse>(
                    new Error("TextureSetNameAlreadyExists", $"A texture set with the name '{command.Name}' already exists."));
            }

            // Update the texture set name
            textureSet.UpdateName(command.Name, _dateTimeProvider.UtcNow);

            var updatedTextureSet = await _textureSetRepository.UpdateAsync(textureSet, cancellationToken);

            return Result.Success(new UpdateTextureSetResponse(updatedTextureSet.Id, updatedTextureSet.Name));
        }
        catch (ArgumentException ex)
        {
            return Result.Failure<UpdateTextureSetResponse>(
                new Error("TextureSetUpdateFailed", ex.Message));
        }
    }
}

public record UpdateTextureSetCommand(int Id, string Name) : ICommand<UpdateTextureSetResponse>;
public record UpdateTextureSetResponse(int Id, string Name);