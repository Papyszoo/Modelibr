using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.Models;

public record SetMainVariantCommand(int ModelVersionId, string VariantName) : ICommand;

internal class SetMainVariantCommandHandler : ICommandHandler<SetMainVariantCommand>
{
    private readonly IModelVersionRepository _modelVersionRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public SetMainVariantCommandHandler(
        IModelVersionRepository modelVersionRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _modelVersionRepository = modelVersionRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result> Handle(SetMainVariantCommand command, CancellationToken cancellationToken)
    {
        try
        {
            var modelVersion = await _modelVersionRepository.GetByIdAsync(command.ModelVersionId, cancellationToken);
            if (modelVersion == null)
            {
                return Result.Failure(
                    new Error("ModelVersionNotFound", $"Model version with ID {command.ModelVersionId} was not found."));
            }

            var now = _dateTimeProvider.UtcNow;
            modelVersion.SetMainVariant(command.VariantName, now);
            await _modelVersionRepository.UpdateAsync(modelVersion, cancellationToken);

            return Result.Success();
        }
        catch (InvalidOperationException ex)
        {
            return Result.Failure(
                new Error("InvalidVariant", ex.Message));
        }
    }
}
