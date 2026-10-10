using SharedKernel;

namespace WebApi.Endpoints;

/// <summary>
/// The empty-file and maximum-size checks every thumbnail upload shares before it reaches a
/// command. Kept in one place so the model and VFX upload paths cannot drift apart on the
/// limit or on the error codes a caller is expected to handle.
/// </summary>
internal static class ThumbnailFileValidator
{
    public static Result Validate(IFormFile file, long maxThumbnailSizeBytes)
    {
        if (file is null || file.Length <= 0)
        {
            return Result.Failure(new Error("InvalidThumbnailFile", "Thumbnail file is empty or invalid."));
        }

        if (file.Length > maxThumbnailSizeBytes)
        {
            var maxSizeMb = maxThumbnailSizeBytes / 1_048_576;
            return Result.Failure(new Error(
                "ThumbnailFileTooLarge", $"Thumbnail file size cannot exceed {maxSizeMb}MB."));
        }

        return Result.Success();
    }
}
