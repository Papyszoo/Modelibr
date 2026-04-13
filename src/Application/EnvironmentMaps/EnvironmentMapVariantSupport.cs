using Application.Abstractions.Files;
using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Application.Services;
using Domain.Models;
using Domain.ValueObjects;
using SharedKernel;
using DomainFile = Domain.Models.File;

namespace Application.EnvironmentMaps;

public sealed record EnvironmentMapCubeFaceFileIds(
    int Px,
    int Nx,
    int Py,
    int Ny,
    int Pz,
    int Nz);

public sealed record EnvironmentMapCubeFaceUploads(
    IFileUpload Px,
    IFileUpload Nx,
    IFileUpload Py,
    IFileUpload Ny,
    IFileUpload Pz,
    IFileUpload Nz);

internal sealed record EnvironmentMapVariantReferenceInput(
    int? FileId,
    EnvironmentMapCubeFaceFileIds? CubeFaces);

internal sealed record EnvironmentMapVariantUploadInput(
    IFileUpload? FileUpload,
    EnvironmentMapCubeFaceUploads? CubeFaces);

internal sealed record ResolvedEnvironmentMapVariantFiles(
    EnvironmentMapProjectionType ProjectionType,
    DomainFile? PanoramicFile,
    IReadOnlyDictionary<EnvironmentMapCubeFace, DomainFile> CubeFaceFiles)
{
    public IReadOnlyCollection<DomainFile> AllFiles =>
        ProjectionType == EnvironmentMapProjectionType.Panoramic
            ? PanoramicFile == null ? [] : [PanoramicFile]
            : CubeFaceFiles.Values.ToList().AsReadOnly();

    public DomainFile? PreviewFile =>
        ProjectionType == EnvironmentMapProjectionType.Panoramic
            ? PanoramicFile
            : CubeFaceFiles.TryGetValue(EnvironmentMapCubeFace.Pz, out var pz)
                ? pz
                : CubeFaceFiles.OrderBy(kvp => GetFaceOrder(kvp.Key)).Select(kvp => kvp.Value).FirstOrDefault();

    public EnvironmentMapVariant CreateVariant(string sizeLabel, DateTime createdAt)
    {
        return ProjectionType == EnvironmentMapProjectionType.Panoramic
            ? EnvironmentMapVariant.CreatePanoramic(PanoramicFile!, sizeLabel, createdAt)
            : EnvironmentMapVariant.CreateCube(CubeFaceFiles, sizeLabel, createdAt);
    }

    private static int GetFaceOrder(EnvironmentMapCubeFace face) => face switch
    {
        EnvironmentMapCubeFace.Px => 0,
        EnvironmentMapCubeFace.Nx => 1,
        EnvironmentMapCubeFace.Py => 2,
        EnvironmentMapCubeFace.Ny => 3,
        EnvironmentMapCubeFace.Pz => 4,
        EnvironmentMapCubeFace.Nz => 5,
        _ => int.MaxValue
    };
}

internal static class EnvironmentMapVariantSupport
{
    public static async Task<Result<ResolvedEnvironmentMapVariantFiles>> ResolveFromExistingFilesAsync(
        EnvironmentMapVariantReferenceInput input,
        IFileRepository fileRepository,
        CancellationToken cancellationToken)
    {
        if (input.CubeFaces != null)
        {
            var faceFiles = new Dictionary<EnvironmentMapCubeFace, DomainFile>();
            foreach (var (face, fileId) in EnumerateCubeFaceIds(input.CubeFaces))
            {
                var file = await fileRepository.GetByIdAsync(fileId, cancellationToken);
                if (file == null)
                {
                    return Result.Failure<ResolvedEnvironmentMapVariantFiles>(
                        new Error("FileNotFound", $"File with ID {fileId} was not found."));
                }

                faceFiles[face] = file;
            }

            return Result.Success(new ResolvedEnvironmentMapVariantFiles(EnvironmentMapProjectionType.Cube, null, faceFiles));
        }

        if (!input.FileId.HasValue)
        {
            return Result.Failure<ResolvedEnvironmentMapVariantFiles>(
                new Error("InvalidInput", "Either fileId or all six cube face file IDs are required."));
        }

        var panoramicFile = await fileRepository.GetByIdAsync(input.FileId.Value, cancellationToken);
        if (panoramicFile == null)
        {
            return Result.Failure<ResolvedEnvironmentMapVariantFiles>(
                new Error("FileNotFound", $"File with ID {input.FileId.Value} was not found."));
        }

        return Result.Success(new ResolvedEnvironmentMapVariantFiles(
            EnvironmentMapProjectionType.Panoramic,
            panoramicFile,
            new Dictionary<EnvironmentMapCubeFace, DomainFile>()));
    }

    public static async Task<Result<ResolvedEnvironmentMapVariantFiles>> ResolveFromUploadsAsync(
        EnvironmentMapVariantUploadInput input,
        IFileCreationService fileCreationService,
        CancellationToken cancellationToken)
    {
        if (input.CubeFaces != null)
        {
            var faceFiles = new Dictionary<EnvironmentMapCubeFace, DomainFile>();
            foreach (var (face, upload) in EnumerateCubeFaceUploads(input.CubeFaces))
            {
                var fileTypeResult = FileType.ValidateForEnvironmentMapUpload(upload.FileName);
                if (fileTypeResult.IsFailure)
                    return Result.Failure<ResolvedEnvironmentMapVariantFiles>(fileTypeResult.Error);

                var fileResult = await fileCreationService.CreateOrGetExistingFileAsync(upload, fileTypeResult.Value, cancellationToken);
                if (fileResult.IsFailure)
                    return Result.Failure<ResolvedEnvironmentMapVariantFiles>(fileResult.Error);

                faceFiles[face] = fileResult.Value;
            }

            return Result.Success(new ResolvedEnvironmentMapVariantFiles(EnvironmentMapProjectionType.Cube, null, faceFiles));
        }

        if (input.FileUpload == null)
        {
            return Result.Failure<ResolvedEnvironmentMapVariantFiles>(
                new Error("InvalidInput", "Either file or all six cube face files are required."));
        }

        var panoramicFileTypeResult = FileType.ValidateForEnvironmentMapUpload(input.FileUpload.FileName);
        if (panoramicFileTypeResult.IsFailure)
            return Result.Failure<ResolvedEnvironmentMapVariantFiles>(panoramicFileTypeResult.Error);

        var panoramicFileResult = await fileCreationService.CreateOrGetExistingFileAsync(input.FileUpload, panoramicFileTypeResult.Value, cancellationToken);
        if (panoramicFileResult.IsFailure)
            return Result.Failure<ResolvedEnvironmentMapVariantFiles>(panoramicFileResult.Error);

        return Result.Success(new ResolvedEnvironmentMapVariantFiles(
            EnvironmentMapProjectionType.Panoramic,
            panoramicFileResult.Value,
            new Dictionary<EnvironmentMapCubeFace, DomainFile>()));
    }

    public static async Task<Result<string>> ResolveSizeLabelAsync(
        string? requestedSizeLabel,
        ResolvedEnvironmentMapVariantFiles files,
        IEnvironmentMapSizeLabelService sizeLabelService,
        CancellationToken cancellationToken)
    {
        if (!string.IsNullOrWhiteSpace(requestedSizeLabel))
            return Result.Success(requestedSizeLabel.Trim());

        return await sizeLabelService.InferSizeLabelAsync(
            files.AllFiles,
            files.ProjectionType,
            cancellationToken);
    }

    public static IEnumerable<string> GetHashes(ResolvedEnvironmentMapVariantFiles files)
        => files.AllFiles.Select(f => f.Sha256Hash).Distinct(StringComparer.OrdinalIgnoreCase);

    public static IReadOnlyCollection<BatchUpload> CreateBatchUploads(
        string batchId,
        DateTime uploadedAt,
        ResolvedEnvironmentMapVariantFiles files,
        int? packId,
        int? projectId,
        int environmentMapId)
    {
        return files.AllFiles
            .Select(file => BatchUpload.Create(
                batchId,
                "environmentmap",
                file.Id,
                uploadedAt,
                packId: packId,
                projectId: projectId,
                environmentMapId: environmentMapId))
            .ToList()
            .AsReadOnly();
    }

    private static IEnumerable<(EnvironmentMapCubeFace Face, int FileId)> EnumerateCubeFaceIds(EnvironmentMapCubeFaceFileIds cubeFaces)
    {
        yield return (EnvironmentMapCubeFace.Px, cubeFaces.Px);
        yield return (EnvironmentMapCubeFace.Nx, cubeFaces.Nx);
        yield return (EnvironmentMapCubeFace.Py, cubeFaces.Py);
        yield return (EnvironmentMapCubeFace.Ny, cubeFaces.Ny);
        yield return (EnvironmentMapCubeFace.Pz, cubeFaces.Pz);
        yield return (EnvironmentMapCubeFace.Nz, cubeFaces.Nz);
    }

    private static IEnumerable<(EnvironmentMapCubeFace Face, IFileUpload Upload)> EnumerateCubeFaceUploads(EnvironmentMapCubeFaceUploads cubeFaces)
    {
        yield return (EnvironmentMapCubeFace.Px, cubeFaces.Px);
        yield return (EnvironmentMapCubeFace.Nx, cubeFaces.Nx);
        yield return (EnvironmentMapCubeFace.Py, cubeFaces.Py);
        yield return (EnvironmentMapCubeFace.Ny, cubeFaces.Ny);
        yield return (EnvironmentMapCubeFace.Pz, cubeFaces.Pz);
        yield return (EnvironmentMapCubeFace.Nz, cubeFaces.Nz);
    }
}
