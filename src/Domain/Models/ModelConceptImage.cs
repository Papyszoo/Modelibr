namespace Domain.Models;

public class ModelConceptImage
{
    public int Id { get; private set; }
    public int ModelId { get; private set; }
    public int FileId { get; private set; }
    public int SortOrder { get; private set; }
    public DateTime CreatedAt { get; private set; }

    public Model Model { get; private set; } = null!;
    public File File { get; private set; } = null!;

    public static ModelConceptImage Create(int modelId, int fileId, int sortOrder, DateTime createdAt)
    {
        if (modelId <= 0)
            throw new ArgumentException("Model ID must be greater than 0.", nameof(modelId));

        if (fileId <= 0)
            throw new ArgumentException("File ID must be greater than 0.", nameof(fileId));

        if (sortOrder < 0)
            throw new ArgumentException("Sort order cannot be negative.", nameof(sortOrder));

        return new ModelConceptImage
        {
            ModelId = modelId,
            FileId = fileId,
            SortOrder = sortOrder,
            CreatedAt = createdAt
        };
    }

    public void UpdateSortOrder(int sortOrder)
    {
        if (sortOrder < 0)
            throw new ArgumentException("Sort order cannot be negative.", nameof(sortOrder));

        SortOrder = sortOrder;
    }
}