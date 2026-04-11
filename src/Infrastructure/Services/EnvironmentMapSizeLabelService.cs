using Application.Abstractions.Services;
using Application.Abstractions.Storage;
using Domain.Models;
using Domain.ValueObjects;
using ImageMagick;
using Infrastructure.Images;
using SharedKernel;
using SixLabors.ImageSharp;
using DomainFile = Domain.Models.File;

namespace Infrastructure.Services;

internal sealed class EnvironmentMapSizeLabelService : IEnvironmentMapSizeLabelService
{
    private readonly IUploadPathProvider _pathProvider;

    public EnvironmentMapSizeLabelService(IUploadPathProvider pathProvider)
    {
        _pathProvider = pathProvider;
    }

    public async Task<Result<string>> InferSizeLabelAsync(
        IReadOnlyCollection<DomainFile> files,
        EnvironmentMapProjectionType projectionType,
        CancellationToken cancellationToken = default)
    {
        if (files.Count == 0)
        {
            return Result.Failure<string>(
                new Error("EnvironmentMapSizeLabelInferenceFailed", "At least one file is required to infer an environment map size label."));
        }

        try
        {
            var maxDimension = 0;

            foreach (var file in files)
            {
                var fullPath = ResolveFullPath(file.FilePath);
                var (width, height) = await GetDimensionsAsync(fullPath, cancellationToken);
                maxDimension = Math.Max(maxDimension, Math.Max(width, height));
            }

            var effectiveDimension = projectionType == EnvironmentMapProjectionType.Cube
                ? maxDimension * 4
                : maxDimension;

            if (effectiveDimension <= 0)
            {
                return Result.Failure<string>(
                    new Error("EnvironmentMapSizeLabelInferenceFailed", "Unable to determine environment map dimensions."));
            }

            return Result.Success(EnvironmentMapSizeLabel.FromDimension(effectiveDimension));
        }
        catch (Exception ex)
        {
            return Result.Failure<string>(
                new Error("EnvironmentMapSizeLabelInferenceFailed", $"Unable to infer environment map size label: {ex.Message}"));
        }
    }

    private static async Task<(int Width, int Height)> GetDimensionsAsync(string fullPath, CancellationToken cancellationToken)
    {
        if (await HdrImageFormatDetector.IsHdrCapableAsync(fullPath, cancellationToken))
        {
            var magickInfo = new MagickImageInfo(fullPath);
            return ((int)magickInfo.Width, (int)magickInfo.Height);
        }

        var imageInfo = await Image.IdentifyAsync(fullPath, cancellationToken);
        if (imageInfo == null)
            throw new InvalidOperationException($"Could not identify image dimensions for '{fullPath}'.");

        return (imageInfo.Width, imageInfo.Height);
    }

    private string ResolveFullPath(string relativePath)
        => Path.Combine(_pathProvider.UploadRootPath, relativePath);
}
