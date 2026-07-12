using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.Models;

internal class UpdateMaterialNamesCommandHandler : ICommandHandler<UpdateMaterialNamesCommand>
{
    private readonly IModelVersionRepository _modelVersionRepository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IUnitOfWork _unitOfWork;

    public UpdateMaterialNamesCommandHandler(
        IModelVersionRepository modelVersionRepository,
        IDateTimeProvider dateTimeProvider,
        IUnitOfWork unitOfWork)
    {
        _modelVersionRepository = modelVersionRepository;
        _dateTimeProvider = dateTimeProvider;
        _unitOfWork = unitOfWork;
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
            await _unitOfWork.SaveChangesAsync(cancellationToken);

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
