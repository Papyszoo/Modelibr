namespace Application.Abstractions.Files;

public interface IFileUpload
{
    string FileName { get; }
    string ContentType { get; }
    long Length { get; }

    Stream OpenRead();

    Task CopyToAsync(Stream target, CancellationToken cancellationToken = default);
}