using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.Models;

internal class UpdateMaterialNamesCommandHandler : ICommandHandler<UpdateMaterialNamesCommand>
{
    private readonly IModelVersionRepository _modelVersionRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public UpdateMaterialNamesCommandHandler(
        IModelVersionRepository modelVersionRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _modelVersionRepository = modelVersionRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result> Handle(UpdateMaterialNamesCommand command, CancellationToken cancellationToken)
    {
        try
        {
            var modelVersion = await _modelVersionRepository.GetByIdAsync(command.ModelVersionId, cancellationToken);
            if (modelVersion == null)
            {
                return Result.Failure(
                    new Error("ModelVersionNotFound", $"Model version with ID {command.ModelVersionId} was not found."));
            }

            modelVersion.SetMaterialNames(command.MaterialNames, _dateTimeProvider.UtcNow);

            await _modelVersionRepository.UpdateAsync(modelVersion, cancellationToken);

            return Result.Success();
        }
        catch (ArgumentException ex)
        {
            return Result.Failure(
                new Error("UpdateMaterialNamesFailed", ex.Message));
        }
    }
}

public record UpdateMaterialNamesCommand(int ModelVersionId, List<string> MaterialNames) : ICommand;
