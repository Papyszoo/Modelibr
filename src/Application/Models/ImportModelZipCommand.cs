using System.IO.Compression;
using Application.Abstractions.Files;
using Application.Abstractions.Messaging;
using Application.Settings;
using Microsoft.Extensions.Logging;
using SharedKernel;

namespace Application.Models;

/// <summary>
/// Imports every model group found in an uploaded <c>.zip</c>. The archive is unzipped
/// in-memory, grouped by directory (<see cref="MultiFileImportGrouping"/>), and each
/// group imported via <see cref="ImportModelWithAuxiliaryFilesCommand"/> so a multi-file
/// glTF resolves its external buffers/textures. Robust where a browser folder walk is
/// quirky — the frontend just posts the archive.
/// </summary>
internal class ImportModelZipCommandHandler
    : ICommandHandler<ImportModelZipCommand, ImportModelZipResponse>
{
    // Anti-zip-bomb guards for a local-first import surface.
    private const long MaxTotalUncompressedBytes = 2_000_000_000; // 2 GB across the whole archive
    private const int MaxEntries = 20_000;

    private readonly ICommandHandler<ImportModelWithAuxiliaryFilesCommand, ImportModelWithAuxiliaryFilesResponse> _importHandler;
    private readonly ISettingsService _settingsService;
    private readonly ILogger<ImportModelZipCommandHandler> _logger;

    public ImportModelZipCommandHandler(
        ICommandHandler<ImportModelWithAuxiliaryFilesCommand, ImportModelWithAuxiliaryFilesResponse> importHandler,
        ISettingsService settingsService,
        ILogger<ImportModelZipCommandHandler> logger)
    {
        _importHandler = importHandler;
        _settingsService = settingsService;
        _logger = logger;
    }

    public async Task<Result<ImportModelZipResponse>> Handle(
        ImportModelZipCommand command,
        CancellationToken cancellationToken)
    {
        var settings = await _settingsService.GetSettingsAsync(cancellationToken);
        var maxFileSize = settings.MaxFileSizeBytes;

        List<MultiFileImportEntry> entries;
        try
        {
            entries = ReadEntries(command.Zip, maxFileSize, out var overLimitError);
            if (overLimitError is not null)
                return Result.Failure<ImportModelZipResponse>(overLimitError);
        }
        catch (InvalidDataException ex)
        {
            return Result.Failure<ImportModelZipResponse>(
                new Error("InvalidArchive", $"The uploaded file is not a valid .zip archive: {ex.Message}"));
        }

        var groups = MultiFileImportGrouping.Group(entries);
        if (groups.Count == 0)
        {
            return Result.Failure<ImportModelZipResponse>(
                new Error("NoModelInArchive", "The archive contains no importable model file (.gltf, .glb, .obj, .fbx, .stl, .3mf, .blend)."));
        }

        var batchId = command.BatchId ?? Guid.NewGuid().ToString();
        var imported = new List<ImportModelWithAuxiliaryFilesResponse>();

        foreach (var group in groups)
        {
            var result = await _importHandler.Handle(
                new ImportModelWithAuxiliaryFilesCommand(group.Primary, group.Auxiliaries, batchId),
                cancellationToken);

            if (result.IsFailure)
            {
                // One bad group shouldn't abort the whole archive — log and keep going.
                _logger.LogWarning(
                    "Skipping a group in zip import ({Primary}): {Error}",
                    group.Primary.FileName, result.Error.Message);
                continue;
            }

            imported.Add(result.Value);
        }

        if (imported.Count == 0)
        {
            return Result.Failure<ImportModelZipResponse>(
                new Error("ZipImportFailed", "No model group in the archive could be imported."));
        }

        return Result.Success(new ImportModelZipResponse(batchId, imported));
    }

    private static List<MultiFileImportEntry> ReadEntries(IFileUpload zip, long maxFileSize, out Error? overLimitError)
    {
        overLimitError = null;
        var entries = new List<MultiFileImportEntry>();
        long totalBytes = 0;

        using var stream = zip.OpenRead();
        using var archive = new ZipArchive(stream, ZipArchiveMode.Read);

        if (archive.Entries.Count > MaxEntries)
        {
            overLimitError = new Error("ArchiveTooLarge", $"The archive has more than {MaxEntries} entries.");
            return entries;
        }

        foreach (var entry in archive.Entries)
        {
            // Directory entries have an empty Name; skip them.
            if (string.IsNullOrEmpty(entry.Name))
                continue;

            if (entry.Length > maxFileSize)
            {
                var maxSizeMb = maxFileSize / 1_048_576;
                overLimitError = new Error("FileTooLarge", $"'{entry.FullName}' exceeds the {maxSizeMb}MB per-file limit.");
                return entries;
            }

            totalBytes += entry.Length;
            if (totalBytes > MaxTotalUncompressedBytes)
            {
                overLimitError = new Error("ArchiveTooLarge", "The archive's uncompressed size exceeds the allowed limit.");
                return entries;
            }

            using var entryStream = entry.Open();
            using var buffer = new MemoryStream();
            entryStream.CopyTo(buffer);
            // entry.FullName is the archive-relative path; grouping normalizes it.
            entries.Add(new MultiFileImportEntry(entry.FullName, buffer.ToArray()));
        }

        return entries;
    }
}

public record ImportModelZipCommand(IFileUpload Zip, string? BatchId = null) : ICommand<ImportModelZipResponse>;

public record ImportModelZipResponse(string BatchId, IReadOnlyList<ImportModelWithAuxiliaryFilesResponse> Imported);
