using Application.Abstractions.Files;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Services;
using Domain.Models;
using Domain.Services;
using Domain.ValueObjects;
using SharedKernel;

namespace Application.EnvironmentMaps;

internal sealed class AddEnvironmentMapVariantWithFileCommandHandler : ICommandHandler<AddEnvironmentMapVariantWithFileCommand, AddEnvironmentMapVariantResponse>
{
    private readonly IEnvironmentMapRepository _environmentMapRepository;
    private readonly IFileCreationService _fileCreationService;
    private readonly IDateTimeProvider _dateTimeProvider;

    public AddEnvironmentMapVariantWithFileCommandHandler(
        IEnvironmentMapRepository environmentMapRepository,
        IFileCreationService fileCreationService,
        IDateTimeProvider dateTimeProvider)
    {
        _environmentMapRepository = environmentMapRepository;
        _fileCreationService = fileCreationService;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result<AddEnvironmentMapVariantResponse>> Handle(AddEnvironmentMapVariantWithFileCommand command, CancellationToken cancellationToken)
    {
        try
        {
            var environmentMap = await _environmentMapRepository.GetByIdAsync(command.EnvironmentMapId, cancellationToken);
            if (environmentMap == null)
            {
                return Result.Failure<AddEnvironmentMapVariantResponse>(
                    new Error("EnvironmentMapNotFound", $"Environment map with ID {command.EnvironmentMapId} was not found."));
            }

            var fileTypeResult = FileType.ValidateForEnvironmentMapUpload(command.FileUpload.FileName);
            if (fileTypeResult.IsFailure)
                return Result.Failure<AddEnvironmentMapVariantResponse>(fileTypeResult.Error);

            var fileResult = await _fileCreationService.CreateOrGetExistingFileAsync(command.FileUpload, fileTypeResult.Value, cancellationToken);
            if (fileResult.IsFailure)
                return Result.Failure<AddEnvironmentMapVariantResponse>(fileResult.Error);

            var now = _dateTimeProvider.UtcNow;
            var variant = EnvironmentMapVariant.Create(fileResult.Value, command.SizeLabel, now);
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

public record AddEnvironmentMapVariantWithFileCommand(int EnvironmentMapId, IFileUpload FileUpload, string SizeLabel) : ICommand<AddEnvironmentMapVariantResponse>;
