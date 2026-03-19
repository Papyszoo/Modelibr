using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.Models;

public record AddVariantNameCommand(int ModelVersionId, string VariantName) : ICommand;

internal class AddVariantNameCommandHandler : ICommandHandler<AddVariantNameCommand>
{
    private readonly IModelVersionRepository _modelVersionRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public AddVariantNameCommandHandler(
        IModelVersionRepository modelVersionRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _modelVersionRepository = modelVersionRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result> Handle(AddVariantNameCommand command, CancellationToken cancellationToken)
    {
        var modelVersion = await _modelVersionRepository.GetByIdAsync(command.ModelVersionId, cancellationToken);
        if (modelVersion == null)
        {
            return Result.Failure(
                new Error("ModelVersionNotFound", $"Model version with ID {command.ModelVersionId} was not found."));
        }

        var variantName = command.VariantName?.Trim() ?? string.Empty;
        if (string.IsNullOrEmpty(variantName))
        {
            return Result.Failure(
                new Error("InvalidVariantName", "Variant name cannot be empty."));
        }

        var now = _dateTimeProvider.UtcNow;
        modelVersion.AddVariantName(variantName, now);
        await _modelVersionRepository.UpdateAsync(modelVersion, cancellationToken);

        return Result.Success();
    }
}
