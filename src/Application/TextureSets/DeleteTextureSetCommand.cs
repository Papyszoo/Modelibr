using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.TextureSets;

internal class DeleteTextureSetCommandHandler : ICommandHandler<DeleteTextureSetCommand>
{
    private readonly ITextureSetRepository _textureSetRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public DeleteTextureSetCommandHandler(
        ITextureSetRepository textureSetRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _textureSetRepository = textureSetRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result> Handle(DeleteTextureSetCommand command, CancellationToken cancellationToken)
    {
        var textureSet = await _textureSetRepository.GetByIdAsync(command.Id, cancellationToken);
        if (textureSet == null)
        {
            return Result.Failure(
                new Error("TextureSetNotFound", $"Texture set with ID {command.Id} was not found."));
        }

        // Perform soft delete instead of hard delete
        textureSet.SoftDelete(_dateTimeProvider.UtcNow);
        await _textureSetRepository.UpdateAsync(textureSet, cancellationToken);

        return Result.Success();
    }
}

public record DeleteTextureSetCommand(int Id) : ICommand;