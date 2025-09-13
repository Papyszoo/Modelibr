namespace Application.Abstractions.Files;

public interface IFileUpload
{
    string FileName { get; }
    string ContentType { get; }
    long Length { get; }

    // Open a readable stream. Caller is responsible for disposing.
    Stream OpenRead();

    // Convenience for piping to another stream.
    Task CopyToAsync(Stream target, CancellationToken cancellationToken = default);
}