using SharedKernel;

namespace Domain.Events;

/// <summary>
/// Domain event raised when a model is shown to users after deduplication is complete.
/// This triggers thumbnail generation since we now know the model is unique or properly merged.
/// </summary>
public class ModelShownEvent : DomainEvent
{
    /// <summary>
    /// The ID of the model that was shown.
    /// </summary>
    public int ModelId { get; }

    public ModelShownEvent(int modelId)
    {
        ModelId = modelId;
    }
}
