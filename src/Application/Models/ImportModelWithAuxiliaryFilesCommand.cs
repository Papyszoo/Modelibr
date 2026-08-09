using Application.Abstractions;
using Application.Abstractions.Files;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Services;
using Domain.Models;
using Domain.Services;
using Domain.ValueObjects;
using Microsoft.Extensions.Logging;
using SharedKernel;

namespace Application.Models;

/// <summary>
/// Imports a loose primary model file (a <c>.gltf</c>, or any renderable/project file)
/// together with its external auxiliary files (the <c>.bin</c> buffers and textures it
/// references), so a multi-file glTF loads and extracts identically to a packed
/// <c>.glb</c>. Reuses <see cref="AddModelCommand"/> for the primary, then links each
/// auxiliary to the created version's <see cref="ModelVersionAuxiliaryFile"/> set with
/// the relative path the primary references it by.
/// </summary>
internal class ImportModelWithAuxiliaryFilesCommandHandler
    : ICommandHandler<ImportModelWithAuxiliaryFilesCommand, ImportModelWithAuxiliaryFilesResponse>
{
    private readonly ICommandHandler<AddModelCommand, AddModelCommandResponse> _addModelHandler;
    private readonly IModelRepository _modelRepository;
    private readonly IFileCreationService _fileCreationService;
    private readonly IModelVersionAuxiliaryFileRepository _auxiliaryRepository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ILogger<ImportModelWithAuxiliaryFilesCommandHandler> _logger;

    public ImportModelWithAuxiliaryFilesCommandHandler(
        ICommandHandler<AddModelCommand, AddModelCommandResponse> addModelHandler,
        IModelRepository modelRepository,
        IFileCreationService fileCreationService,
        IModelVersionAuxiliaryFileRepository auxiliaryRepository,
        IDateTimeProvider dateTimeProvider,
        IUnitOfWork unitOfWork,
        ILogger<ImportModelWithAuxiliaryFilesCommandHandler> logger)
    {
        _addModelHandler = addModelHandler;
        _modelRepository = modelRepository;
        _fileCreationService = fileCreationService;
        _auxiliaryRepository = auxiliaryRepository;
        _dateTimeProvider = dateTimeProvider;
        _unitOfWork = unitOfWork;
        _logger = logger;
    }

    public async Task<Result<ImportModelWithAuxiliaryFilesResponse>> Handle(
        ImportModelWithAuxiliaryFilesCommand command,
        CancellationToken cancellationToken)
    {
        var primaryTypeResult = FileType.ValidateForModelUpload(command.Primary.FileName);
        if (primaryTypeResult.IsFailure)
            return Result.Failure<ImportModelWithAuxiliaryFilesResponse>(primaryTypeResult.Error);

        // Reuse the model-creation path (dedup, batch tracking, domain events, save
        // ordering) for the primary; it commits before we read the version id below.
        var modelResult = await _addModelHandler.Handle(
            new AddModelCommand(command.Primary, BatchId: command.BatchId),
            cancellationToken);
        if (modelResult.IsFailure)
            return Result.Failure<ImportModelWithAuxiliaryFilesResponse>(modelResult.Error);

        var model = await _modelRepository.GetByIdAsync(modelResult.Value.Id, cancellationToken);
        if (model?.ActiveVersion is null)
        {
            return Result.Failure<ImportModelWithAuxiliaryFilesResponse>(
                new Error("NoActiveVersion", $"Imported model {modelResult.Value.Id} has no active version."));
        }

        var versionId = model.ActiveVersion.Id;
        var now = _dateTimeProvider.UtcNow;
        var seenPaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var linked = 0;
        var skipped = 0;

        foreach (var auxiliary in command.Auxiliaries)
        {
            string relativePath;
            try
            {
                relativePath = ModelVersionAuxiliaryFile.NormalizeRelativePath(auxiliary.RelativePath);
            }
            catch (ArgumentException)
            {
                // Path traversal or empty — never resolve it.
                skipped++;
                continue;
            }

            if (string.IsNullOrWhiteSpace(relativePath))
            {
                skipped++;
                continue;
            }

            // Dedup within this batch (the unique index also enforces it in the DB) and
            // against already-linked paths from a prior import of the same version.
            if (!seenPaths.Add(relativePath) ||
                await _auxiliaryRepository.ExistsAsync(versionId, relativePath, cancellationToken))
            {
                skipped++;
                continue;
            }

            var auxTypeResult = FileType.ValidateForUpload(auxiliary.File.FileName);
            if (auxTypeResult.IsFailure)
            {
                _logger.LogWarning(
                    "Skipping unsupported auxiliary file {RelativePath} for version {VersionId}: {Error}",
                    relativePath, versionId, auxTypeResult.Error.Message);
                skipped++;
                continue;
            }

            var fileResult = await _fileCreationService.CreateOrGetExistingFileAsync(
                auxiliary.File, auxTypeResult.Value, cancellationToken);
            if (fileResult.IsFailure)
            {
                _logger.LogWarning(
                    "Skipping auxiliary file {RelativePath} for version {VersionId}: {Error}",
                    relativePath, versionId, fileResult.Error.Message);
                skipped++;
                continue;
            }

            var join = ModelVersionAuxiliaryFile.Create(versionId, fileResult.Value, relativePath, now);
            await _auxiliaryRepository.AddAsync(join, cancellationToken);
            linked++;
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return Result.Success(new ImportModelWithAuxiliaryFilesResponse(
            modelResult.Value.Id, modelResult.Value.AlreadyExists, linked, skipped));
    }
}

public record ImportModelWithAuxiliaryFilesCommand(
    IFileUpload Primary,
    IReadOnlyList<AuxiliaryUpload> Auxiliaries,
    string? BatchId = null) : ICommand<ImportModelWithAuxiliaryFilesResponse>;

public record ImportModelWithAuxiliaryFilesResponse(
    int Id,
    bool AlreadyExists,
    int AuxiliaryFilesLinked,
    int AuxiliaryFilesSkipped);
