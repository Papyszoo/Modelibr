using Application.Abstractions.Files;

namespace Application.Abstractions.Services;

public interface IFileUtilityService
{
    string GetMimeType(string extension);
    Task<string> CalculateFileHashAsync(IFileUpload file, CancellationToken cancellationToken = default);
}