using Application.Abstractions.Services;

namespace Infrastructure.Services;

public class ModelMetadataExtractionService : IModelMetadataExtractionService
{
    public Task<ModelMetadata?> ExtractMetadataAsync(string filePath, CancellationToken cancellationToken = default)
    {
        // TODO: Implement actual 3D model parsing to extract vertices and faces count
        // This would require adding a 3D model parsing library (e.g., Assimp.Net)
        // For now, return null to indicate metadata is not available
        return Task.FromResult<ModelMetadata?>(null);
    }
}
