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

        // Resolve the auxiliaries FIRST. Files are content-addressed, so creating them is
        // idempotent and cheap, and it is the only way to know what this import actually
        // references before deciding whether it is the same asset as an existing one.
        var (resolved, skipped) = await ResolveAuxiliariesAsync(command.Auxiliaries, cancellationToken);

        var now = _dateTimeProvider.UtcNow;

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
        var alreadyExists = modelResult.Value.AlreadyExists;

        // A loose .gltf's identity is its JSON *plus* the resources it references. If the
        // primary hash matched an existing model but that model's auxiliaries differ, the
        // two imports are different assets: merging them would keep one asset's geometry
        // and silently discard the other's. Re-import as a distinct model instead.
        if (alreadyExists && await ReferencedResourcesDifferAsync(versionId, resolved, cancellationToken))
        {
            _logger.LogInformation(
                "Model {ModelId} shares the primary file hash of this import but references different " +
                "external resources; importing as a separate model rather than merging.",
                model.Id);

            var distinctResult = await _addModelHandler.Handle(
                new AddModelCommand(command.Primary, BatchId: command.BatchId, SkipDeduplication: true),
                cancellationToken);
            if (distinctResult.IsFailure)
                return Result.Failure<ImportModelWithAuxiliaryFilesResponse>(distinctResult.Error);

            model = await _modelRepository.GetByIdAsync(distinctResult.Value.Id, cancellationToken);
            if (model?.ActiveVersion is null)
            {
                return Result.Failure<ImportModelWithAuxiliaryFilesResponse>(
                    new Error("NoActiveVersion", $"Imported model {distinctResult.Value.Id} has no active version."));
            }

            versionId = model.ActiveVersion.Id;
            alreadyExists = false;
        }

        var linked = 0;
        foreach (var (relativePath, file) in resolved)
        {
            // Already linked from a prior import of this exact version — nothing to do.
            if (await _auxiliaryRepository.ExistsAsync(versionId, relativePath, cancellationToken))
            {
                skipped++;
                continue;
            }

            var join = ModelVersionAuxiliaryFile.Create(versionId, file, relativePath, now);
            await _auxiliaryRepository.AddAsync(join, cancellationToken);
            linked++;
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return Result.Success(new ImportModelWithAuxiliaryFilesResponse(
            model.Id, alreadyExists, linked, skipped));
    }

    /// <summary>
    /// Normalises, validates and materialises each auxiliary into a stored
    /// <see cref="Domain.Models.File"/>, dropping duplicates and anything unsupported.
    /// Returns the surviving (relativePath, file) pairs plus a count of what was dropped.
    /// </summary>
    private async Task<(List<(string RelativePath, Domain.Models.File File)> Resolved, int Skipped)>
        ResolveAuxiliariesAsync(
            IReadOnlyList<AuxiliaryUpload> auxiliaries,
            CancellationToken cancellationToken)
    {
        var resolved = new List<(string, Domain.Models.File)>();
        var seenPaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var skipped = 0;

        foreach (var auxiliary in auxiliaries)
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

            if (string.IsNullOrWhiteSpace(relativePath) || !seenPaths.Add(relativePath))
            {
                skipped++;
                continue;
            }

            var auxTypeResult = FileType.ValidateForUpload(auxiliary.File.FileName);
            if (auxTypeResult.IsFailure)
            {
                _logger.LogWarning(
                    "Skipping unsupported auxiliary file {RelativePath}: {Error}",
                    relativePath, auxTypeResult.Error.Message);
                skipped++;
                continue;
            }

            var fileResult = await _fileCreationService.CreateOrGetExistingFileAsync(
                auxiliary.File, auxTypeResult.Value, cancellationToken);
            if (fileResult.IsFailure)
            {
                _logger.LogWarning(
                    "Skipping auxiliary file {RelativePath}: {Error}",
                    relativePath, fileResult.Error.Message);
                skipped++;
                continue;
            }

            resolved.Add((relativePath, fileResult.Value));
        }

        return (resolved, skipped);
    }

    /// <summary>
    /// True when the version already links a different file at any of the relative paths
    /// this import brings — i.e. the two imports reference different resources and cannot
    /// be the same asset. Paths the version does not have yet are additive, not a conflict.
    /// </summary>
    private async Task<bool> ReferencedResourcesDifferAsync(
        int versionId,
        IReadOnlyList<(string RelativePath, Domain.Models.File File)> resolved,
        CancellationToken cancellationToken)
    {
        if (resolved.Count == 0)
        {
            return false;
        }

        var existing = await _auxiliaryRepository.GetForVersionAsync(versionId, cancellationToken);
        if (existing.Count == 0)
        {
            return false;
        }

        // Compare by content hash, not file id: a resource whose bytes the library has
        // never seen comes back as an unsaved entity with id 0, and hashes are the
        // identity that actually matters here.
        var existingByPath = existing.ToDictionary(
            a => a.RelativePath, a => a.File.Sha256Hash, StringComparer.OrdinalIgnoreCase);

        return resolved.Any(r =>
            existingByPath.TryGetValue(r.RelativePath, out var existingHash) &&
            !string.Equals(existingHash, r.File.Sha256Hash, StringComparison.OrdinalIgnoreCase));
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
