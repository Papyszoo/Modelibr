using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.TextureSets;

internal class DisassociateTextureSetFromModelVersionCommandHandler : ICommandHandler<DisassociateTextureSetFromModelVersionCommand>
{
    private readonly IModelVersionRepository _modelVersionRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public DisassociateTextureSetFromModelVersionCommandHandler(
        IModelVersionRepository modelVersionRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _modelVersionRepository = modelVersionRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result> Handle(DisassociateTextureSetFromModelVersionCommand command, CancellationToken cancellationToken)
    {
        try
        {
            // Get the model version
            var modelVersion = await _modelVersionRepository.GetByIdAsync(command.ModelVersionId, cancellationToken);
            if (modelVersion == null)
            {
                return Result.Failure(
                    new Error("ModelVersionNotFound", $"Model version with ID {command.ModelVersionId} was not found."));
            }

            var materialName = command.MaterialName ?? string.Empty;
            var variantName = command.VariantName ?? string.Empty;

            // Always use exact composite key removal to avoid cross-variant data loss.
            // RemoveTextureMappingsByTextureSetIdAsync removes across ALL variants which is wrong
            // when the user only wants to unlink from one specific material+variant.
            await _modelVersionRepository.RemoveTextureMappingAsync(
                modelVersion.Id, command.TextureSetId, materialName, variantName, cancellationToken);

            return Result.Success();
        }
        catch (ArgumentException ex)
        {
            return Result.Failure(
                new Error("DisassociateTextureSetFromModelVersionFailed", ex.Message));
        }
    }
}

public record DisassociateTextureSetFromModelVersionCommand(int TextureSetId, int ModelVersionId, string? MaterialName = null, string? VariantName = null) : ICommand;
