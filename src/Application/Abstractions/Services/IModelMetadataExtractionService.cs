namespace Application.Abstractions.Services;

public interface IModelMetadataExtractionService
{
    Task<ModelMetadata?> ExtractMetadataAsync(string filePath, CancellationToken cancellationToken = default);
}

public record ModelMetadata(int Vertices, int Faces);
