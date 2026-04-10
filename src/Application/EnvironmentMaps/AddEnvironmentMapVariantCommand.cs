using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Models;
using Domain.Services;
using SharedKernel;

namespace Application.EnvironmentMaps;

internal sealed class AddEnvironmentMapVariantCommandHandler : ICommandHandler<AddEnvironmentMapVariantCommand, AddEnvironmentMapVariantResponse>
{
    private readonly IEnvironmentMapRepository _environmentMapRepository;
    private readonly IFileRepository _fileRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public AddEnvironmentMapVariantCommandHandler(
        IEnvironmentMapRepository environmentMapRepository,
        IFileRepository fileRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _environmentMapRepository = environmentMapRepository;
        _fileRepository = fileRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result<AddEnvironmentMapVariantResponse>> Handle(AddEnvironmentMapVariantCommand command, CancellationToken cancellationToken)
    {
        try
        {
            var environmentMap = await _environmentMapRepository.GetByIdAsync(command.EnvironmentMapId, cancellationToken);
            if (environmentMap == null)
            {
                return Result.Failure<AddEnvironmentMapVariantResponse>(
                    new Error("EnvironmentMapNotFound", $"Environment map with ID {command.EnvironmentMapId} was not found."));
            }

            var file = await _fileRepository.GetByIdAsync(command.FileId, cancellationToken);
            if (file == null)
            {
                return Result.Failure<AddEnvironmentMapVariantResponse>(
                    new Error("FileNotFound", $"File with ID {command.FileId} was not found."));
            }

            var now = _dateTimeProvider.UtcNow;
            var variant = EnvironmentMapVariant.Create(file, command.SizeLabel, now);
            environmentMap.AddVariant(variant, now);
            await _environmentMapRepository.UpdateAsync(environmentMap, cancellationToken);

            if (!environmentMap.PreviewVariantId.HasValue && variant.Id > 0)
            {
                environmentMap.SetPreviewVariant(variant.Id, now);
                await _environmentMapRepository.UpdateAsync(environmentMap, cancellationToken);
            }

            return Result.Success(new AddEnvironmentMapVariantResponse(variant.Id, variant.FileId, variant.SizeLabel));
        }
        catch (ArgumentException ex)
        {
            return Result.Failure<AddEnvironmentMapVariantResponse>(new Error("EnvironmentMapVariantCreationFailed", ex.Message));
        }
        catch (InvalidOperationException ex)
        {
            return Result.Failure<AddEnvironmentMapVariantResponse>(new Error("BusinessRuleViolation", ex.Message));
        }
    }
}

public record AddEnvironmentMapVariantCommand(int EnvironmentMapId, int FileId, string SizeLabel) : ICommand<AddEnvironmentMapVariantResponse>;
public record AddEnvironmentMapVariantResponse(int VariantId, int FileId, string SizeLabel);
