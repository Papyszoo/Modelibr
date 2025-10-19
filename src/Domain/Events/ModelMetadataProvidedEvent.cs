using SharedKernel;

namespace Domain.Events;

/// <summary>
/// Domain event raised when model metadata (vertices, faces) is provided.
/// This triggers deduplication logic to merge models with identical name and vertices.
/// </summary>
public class ModelMetadataProvidedEvent : DomainEvent
{
    /// <summary>
    /// The ID of the model that received metadata.
    /// </summary>
    public int ModelId { get; }
    
    /// <summary>
    /// The name of the model.
    /// </summary>
    public string ModelName { get; }
    
    /// <summary>
    /// The number of vertices in the model.
    /// </summary>
    public int? Vertices { get; }
    
    /// <summary>
    /// The number of faces in the model.
    /// </summary>
    public int? Faces { get; }

    public ModelMetadataProvidedEvent(int modelId, string modelName, int? vertices, int? faces)
    {
        ModelId = modelId;
        ModelName = modelName ?? throw new ArgumentNullException(nameof(modelName));
        Vertices = vertices;
        Faces = faces;
    }
}
