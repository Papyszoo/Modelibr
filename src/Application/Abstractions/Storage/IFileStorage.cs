using Application.Abstractions.Files;
using Domain.Files;

namespace Application.Abstractions.Storage;

public record StoredFileResult(
    string RelativePath,
    string StoredName,
    string Sha256,
    long SizeBytes);

public interface IFileStorage
{
    Task<StoredFileResult> SaveAsync(
        IFileUpload upload,
        FileType fileType,
        CancellationToken ct);
}