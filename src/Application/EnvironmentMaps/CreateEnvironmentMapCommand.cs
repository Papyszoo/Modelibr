using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Models;
using Domain.Services;
using SharedKernel;

namespace Application.EnvironmentMaps;

internal sealed class CreateEnvironmentMapCommandHandler : ICommandHandler<CreateEnvironmentMapCommand, CreateEnvironmentMapResponse>
{
    private readonly IEnvironmentMapRepository _environmentMapRepository;
    private readonly IFileRepository _fileRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public CreateEnvironmentMapCommandHandler(
        IEnvironmentMapRepository environmentMapRepository,
        IFileRepository fileRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _environmentMapRepository = environmentMapRepository;
        _fileRepository = fileRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result<CreateEnvironmentMapResponse>> Handle(CreateEnvironmentMapCommand command, CancellationToken cancellationToken)
    {
        try
        {
            var existingByName = await _environmentMapRepository.GetByNameAsync(command.Name, cancellationToken);
            if (existingByName != null)
            {
                return Result.Failure<CreateEnvironmentMapResponse>(
                    new Error("EnvironmentMapAlreadyExists", $"An environment map with the name '{command.Name}' already exists."));
            }

            var file = await _fileRepository.GetByIdAsync(command.FileId, cancellationToken);
            if (file == null)
            {
                return Result.Failure<CreateEnvironmentMapResponse>(
                    new Error("FileNotFound", $"File with ID {command.FileId} was not found."));
            }

            var now = _dateTimeProvider.UtcNow;
            var environmentMap = EnvironmentMap.Create(command.Name, now);
            var created = await _environmentMapRepository.AddAsync(environmentMap, cancellationToken);

            var variant = EnvironmentMapVariant.Create(file, command.SizeLabel, now);
            created.AddVariant(variant, now);
            await _environmentMapRepository.UpdateAsync(created, cancellationToken);

            created.SetPreviewVariant(variant.Id, now);
            await _environmentMapRepository.UpdateAsync(created, cancellationToken);

            return Result.Success(new CreateEnvironmentMapResponse(created.Id, created.Name, variant.Id, variant.FileId, created.PreviewVariantId));
        }
        catch (ArgumentException ex)
        {
            return Result.Failure<CreateEnvironmentMapResponse>(new Error("EnvironmentMapCreationFailed", ex.Message));
        }
        catch (InvalidOperationException ex)
        {
            return Result.Failure<CreateEnvironmentMapResponse>(new Error("BusinessRuleViolation", ex.Message));
        }
    }
}

public record CreateEnvironmentMapCommand(string Name, int FileId, string SizeLabel) : ICommand<CreateEnvironmentMapResponse>;
public record CreateEnvironmentMapResponse(int Id, string Name, int VariantId, int FileId, int? PreviewVariantId);
