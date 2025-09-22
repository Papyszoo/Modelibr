using SharedKernel;

namespace Domain.Events;

/// <summary>
/// Domain event raised when a model is successfully uploaded.
/// </summary>
public class ModelUploadedEvent : DomainEvent
{
    /// <summary>
    /// The ID of the uploaded model.
    /// </summary>
    public int ModelId { get; }
    
    /// <summary>
    /// The SHA256 hash of the model file for deduplication.
    /// </summary>
    public string ModelHash { get; }
    
    /// <summary>
    /// Indicates if this was a new model or an existing one was returned.
    /// </summary>
    public bool IsNewModel { get; }

    public ModelUploadedEvent(int modelId, string modelHash, bool isNewModel)
    {
        ModelId = modelId;
        ModelHash = modelHash ?? throw new ArgumentNullException(nameof(modelHash));
        IsNewModel = isNewModel;
    }
}