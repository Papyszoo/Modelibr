namespace Domain.Models;

/// <summary>
/// Represents a batch upload operation tracking multiple files uploaded together.
/// </summary>
public class BatchUpload
{
    public int Id { get; set; }
    
    /// <summary>
    /// Unique identifier for the batch. Multiple files uploaded together share the same BatchId.
    /// </summary>
    public required string BatchId { get; set; }
    
    /// <summary>
    /// Type of upload: 'pack', 'model', or 'textureSet' indicating where files were uploaded.
    /// </summary>
    public required string UploadType { get; set; }
    
    /// <summary>
    /// Timestamp when the upload occurred.
    /// </summary>
    public DateTime UploadedAt { get; set; }
    
    /// <summary>
    /// Optional reference to the pack if this was a direct upload to a pack.
    /// </summary>
    public int? PackId { get; set; }
    
    /// <summary>
    /// Optional reference to the project if this was a direct upload to a project.
    /// </summary>
    public int? ProjectId { get; set; }
    
    /// <summary>
    /// Optional reference to the model if this was a direct upload to a model.
    /// </summary>
    public int? ModelId { get; set; }
    
    /// <summary>
    /// Optional reference to the texture set if this was a direct upload to a texture set.
    /// </summary>
    public int? TextureSetId { get; set; }
    
    /// <summary>
    /// Optional reference to the sprite if this was a direct upload to a sprite.
    /// </summary>
    public int? SpriteId { get; set; }
    
    /// <summary>
    /// Reference to the file that was uploaded in this batch.
    /// </summary>
    public int FileId { get; set; }
    
    /// <summary>
    /// Navigation property to the file.
    /// </summary>
    public File? File { get; set; }
    
    /// <summary>
    /// Navigation property to the pack.
    /// </summary>
    public Pack? Pack { get; set; }
    
    /// <summary>
    /// Navigation property to the project.
    /// </summary>
    public Project? Project { get; set; }
    
    /// <summary>
    /// Navigation property to the model.
    /// </summary>
    public Model? Model { get; set; }
    
    /// <summary>
    /// Navigation property to the texture set.
    /// </summary>
    public TextureSet? TextureSet { get; set; }
    
    /// <summary>
    /// Navigation property to the sprite.
    /// </summary>
    public Sprite? Sprite { get; set; }
    
    /// <summary>
    /// Creates a new batch upload record.
    /// </summary>
    /// <param name="batchId">Unique batch identifier</param>
    /// <param name="uploadType">Type of upload (pack, project, model, textureSet)</param>
    /// <param name="fileId">ID of the uploaded file</param>
    /// <param name="uploadedAt">Timestamp of the upload</param>
    /// <param name="packId">Optional pack ID</param>
    /// <param name="projectId">Optional project ID</param>
    /// <param name="modelId">Optional model ID</param>
    /// <param name="textureSetId">Optional texture set ID</param>
    /// <param name="spriteId">Optional sprite ID</param>
    /// <returns>New BatchUpload instance</returns>
    public static BatchUpload Create(
        string batchId,
        string uploadType,
        int fileId,
        DateTime uploadedAt,
        int? packId = null,
        int? projectId = null,
        int? modelId = null,
        int? textureSetId = null,
        int? spriteId = null)
    {
        if (string.IsNullOrWhiteSpace(batchId))
            throw new ArgumentException("Batch ID cannot be null or empty.", nameof(batchId));
        
        if (string.IsNullOrWhiteSpace(uploadType))
            throw new ArgumentException("Upload type cannot be null or empty.", nameof(uploadType));
        
        // Validate upload type
        var validTypes = new[] { "pack", "project", "model", "textureSet", "texture", "file", "sprite" };
        if (!validTypes.Contains(uploadType, StringComparer.OrdinalIgnoreCase))
            throw new ArgumentException($"Upload type must be one of: {string.Join(", ", validTypes)}", nameof(uploadType));
        
        return new BatchUpload
        {
            BatchId = batchId,
            UploadType = uploadType.ToLowerInvariant(),
            FileId = fileId,
            UploadedAt = uploadedAt,
            PackId = packId,
            ProjectId = projectId,
            ModelId = modelId,
            TextureSetId = textureSetId,
            SpriteId = spriteId
        };
    }
    
    /// <summary>
    /// Updates the pack association for this batch upload.
    /// </summary>
    /// <param name="packId">The pack ID to associate</param>
    public void UpdatePackAssociation(int packId)
    {
        PackId = packId;
    }
    
    /// <summary>
    /// Updates the project association for this batch upload.
    /// </summary>
    /// <param name="projectId">The project ID to associate</param>
    public void UpdateProjectAssociation(int projectId)
    {
        ProjectId = projectId;
    }
    
    /// <summary>
    /// Updates the upload type.
    /// </summary>
    /// <param name="uploadType">The new upload type</param>
    public void UpdateUploadType(string uploadType)
    {
        var validTypes = new[] { "pack", "project", "model", "textureSet", "texture", "file", "sprite" };
        if (!validTypes.Contains(uploadType, StringComparer.OrdinalIgnoreCase))
            throw new ArgumentException($"Upload type must be one of: {string.Join(", ", validTypes)}", nameof(uploadType));
        
        UploadType = uploadType.ToLowerInvariant();
    }

    /// <summary>
    /// Updates the sprite association for this batch upload.
    /// </summary>
    /// <param name="spriteId">The sprite ID to associate</param>
    public void UpdateSpriteAssociation(int spriteId)
    {
        SpriteId = spriteId;
    }
}
