using Domain.Events;

namespace Domain.Models
{
    public class Model : AggregateRoot
    {
        private readonly List<TextureSet> _textureSets = new();
        private readonly List<Pack> _packs = new();
        private readonly List<Project> _projects = new();
        private readonly List<ModelVersion> _versions = new();

        public int Id { get; set; }
        public string Name { get; private set; } = string.Empty;
        public DateTime CreatedAt { get; private set; }
        public DateTime UpdatedAt { get; private set; }
        public string? Tags { get; private set; }
        public string? Description { get; private set; }

        public int? DefaultTextureSetId { get; private set; }
        public int? ActiveVersionId { get; private set; }
        public bool IsDeleted { get; private set; }
        public DateTime? DeletedAt { get; private set; }
        
        // Navigation property for many-to-many relationship - EF Core requires this to be settable
        
        // Navigation property for active version
        public ModelVersion? ActiveVersion { get; private set; }

        // Navigation property for many-to-many relationship with TextureSets - EF Core requires this to be settable
        public ICollection<TextureSet> TextureSets 
        { 
            get => _textureSets; 
            set 
            {
                _textureSets.Clear();
                if (value != null)
                    _textureSets.AddRange(value);
            }
        }

        // Navigation property for many-to-many relationship with Packs - EF Core requires this to be settable
        public ICollection<Pack> Packs 
        { 
            get => _packs; 
            set 
            {
                _packs.Clear();
                if (value != null)
                    _packs.AddRange(value);
            }
        }

        // Navigation property for many-to-many relationship with Projects - EF Core requires this to be settable
        public ICollection<Project> Projects 
        { 
            get => _projects; 
            set 
            {
                _projects.Clear();
                if (value != null)
                    _projects.AddRange(value);
            }
        }

        // Navigation property for one-to-many relationship with ModelVersion
        public ICollection<ModelVersion> Versions 
        { 
            get => _versions; 
            set 
            {
                _versions.Clear();
                if (value != null)
                    _versions.AddRange(value);
            }
        }

        public static Model Create(string name, DateTime createdAt)
        {
            if (string.IsNullOrWhiteSpace(name))
                throw new ArgumentException("Model name cannot be null or empty.", nameof(name));
            
            if (name.Length > 200)
                throw new ArgumentException("Model name cannot exceed 200 characters.", nameof(name));

            return new Model
            {
                Name = name.Trim(),
                CreatedAt = createdAt,
                UpdatedAt = createdAt
            };
        }

        public void UpdateName(string name, DateTime updatedAt)
        {
            if (string.IsNullOrWhiteSpace(name))
                throw new ArgumentException("Model name cannot be null or empty.", nameof(name));
            
            if (name.Length > 200)
                throw new ArgumentException("Model name cannot exceed 200 characters.", nameof(name));

            Name = name.Trim();
            UpdatedAt = updatedAt;
        }



        /// <summary>
        /// Associates a texture set with this model.
        /// </summary>
        /// <param name="textureSet">The texture set to associate</param>
        /// <param name="updatedAt">When the association was made</param>
        /// <exception cref="ArgumentNullException">Thrown when textureSet is null</exception>
        public void AddTextureSet(TextureSet textureSet, DateTime updatedAt)
        {
            if (textureSet == null)
                throw new ArgumentNullException(nameof(textureSet));

            if (_textureSets.Any(tp => tp.Id == textureSet.Id))
                return; // Texture set already associated

            _textureSets.Add(textureSet);
            UpdatedAt = updatedAt;
        }

        /// <summary>
        /// Removes a texture set association from this model.
        /// </summary>
        /// <param name="textureSet">The texture set to remove</param>
        /// <param name="updatedAt">When the association was removed</param>
        /// <exception cref="ArgumentNullException">Thrown when textureSet is null</exception>
        public void RemoveTextureSet(TextureSet textureSet, DateTime updatedAt)
        {
            if (textureSet == null)
                throw new ArgumentNullException(nameof(textureSet));

            if (_textureSets.Remove(textureSet))
            {
                UpdatedAt = updatedAt;
            }
        }

        /// <summary>
        /// Checks if this model has an associated texture set with the specified ID.
        /// </summary>
        /// <param name="textureSetId">The texture set ID to check</param>
        /// <returns>True if the texture set is associated with this model</returns>
        public bool HasTextureSet(int textureSetId)
        {
            return _textureSets.Any(tp => tp.Id == textureSetId);
        }

        /// <summary>
        /// Gets all texture sets associated with this model.
        /// </summary>
        /// <returns>Read-only list of associated texture sets</returns>
        public IReadOnlyList<TextureSet> GetTextureSets()
        {
            return _textureSets.AsReadOnly();
        }

        /// <summary>
        /// Sets the default texture set for this model.
        /// </summary>
        /// <param name="textureSetId">The ID of the texture set to set as default, or null to clear</param>
        /// <param name="updatedAt">When the default was set</param>
        /// <exception cref="InvalidOperationException">Thrown when the texture set is not associated with this model</exception>
        public void SetDefaultTextureSet(int? textureSetId, DateTime updatedAt)
        {
            if (textureSetId.HasValue && !_textureSets.Any(ts => ts.Id == textureSetId.Value))
            {
                throw new InvalidOperationException($"Texture set {textureSetId.Value} is not associated with this model.");
            }

            DefaultTextureSetId = textureSetId;
            UpdatedAt = updatedAt;
        }

        /// <summary>
        /// Raises a ModelUploaded domain event for this model.
        /// Should be called when a model upload is completed.
        /// </summary>
        /// <param name="modelVersionId">The ID of the model version the file was added to</param>
        /// <param name="modelHash">The SHA256 hash of the uploaded model file</param>
        /// <param name="isNewModel">Whether this is a new model or an existing one</param>
        public void RaiseModelUploadedEvent(int modelVersionId, string modelHash, bool isNewModel)
        {
            if (modelVersionId <= 0)
                throw new ArgumentException("Model version ID must be greater than 0.", nameof(modelVersionId));
            if (string.IsNullOrWhiteSpace(modelHash))
                throw new ArgumentException("Model hash cannot be null or empty.", nameof(modelHash));

            RaiseDomainEvent(new ModelUploadedEvent(Id, modelVersionId, modelHash, isNewModel));
        }

        /// <summary>
        /// Sets the AI-generated tags and description for this model.
        /// </summary>
        /// <param name="tags">Comma-separated list of tags with optional confidence scores</param>
        /// <param name="description">Generated description of the model</param>
        /// <param name="updatedAt">When the tags were set</param>
        public void SetTagsAndDescription(string? tags, string? description, DateTime updatedAt)
        {
            Tags = tags;
            Description = description;
            UpdatedAt = updatedAt;
        }

        /// <summary>
        /// Creates a new version for this model.
        /// </summary>
        /// <param name="description">Optional description for this version</param>
        /// <param name="createdAt">When the version was created</param>
        /// <returns>The created ModelVersion</returns>
        public ModelVersion CreateVersion(string? description, DateTime createdAt)
        {
            var nextVersionNumber = _versions.Count == 0 ? 1 : _versions.Max(v => v.VersionNumber) + 1;
            var version = ModelVersion.Create(Id, nextVersionNumber, description, createdAt);
            _versions.Add(version);
            
            // If this is the first version, set it as active
            if (_versions.Count == 1)
            {
                ActiveVersion = version;
                // Note: ActiveVersionId will be set when saved to DB, but for in-memory operations we set the navigation property
            }
            
            UpdatedAt = createdAt;
            return version;
        }

        /// <summary>
        /// Sets the active version for this model.
        /// </summary>
        /// <param name="versionId">The ID of the version to set as active</param>
        /// <param name="updatedAt">When the active version was set</param>
        public void SetActiveVersion(int versionId, DateTime updatedAt)
        {
            var version = _versions.FirstOrDefault(v => v.Id == versionId);
            if (version == null)
            {
                throw new InvalidOperationException($"Version with ID {versionId} does not belong to this model.");
            }

            var previousActiveVersionId = ActiveVersionId;
            
            ActiveVersionId = versionId;
            ActiveVersion = version;
            UpdatedAt = updatedAt;
            
            // Raise domain event for active version change
            var thumbnail = version.Thumbnail;
            var hasThumbnail = thumbnail?.Status == ValueObjects.ThumbnailStatus.Ready;
            var thumbnailUrl = hasThumbnail ? $"/model-versions/{versionId}/thumbnail/file" : null;
            
            RaiseDomainEvent(new ActiveVersionChangedEvent(
                Id, 
                versionId, 
                previousActiveVersionId, 
                hasThumbnail, 
                thumbnailUrl));
        }

        /// <summary>
        /// Gets the thumbnail from the active version.
        /// </summary>
        /// <returns>The active version's thumbnail, or null if no active version or no thumbnail</returns>
        public Thumbnail? GetActiveVersionThumbnail()
        {
            return ActiveVersion?.Thumbnail;
        }

        /// <summary>
        /// Gets the files from the active version.
        /// </summary>
        /// <returns>Read-only list of files from the active version</returns>
        public IReadOnlyList<File> GetActiveVersionFiles()
        {
            return ActiveVersion?.Files.ToList().AsReadOnly() ?? new List<File>().AsReadOnly();
        }

        /// <summary>
        /// Gets the latest version (most recently created).
        /// </summary>
        /// <returns>The latest version, or null if no versions exist</returns>
        public ModelVersion? GetLatestVersion()
        {
            return _versions.OrderByDescending(v => v.CreatedAt).FirstOrDefault();
        }

        /// <summary>
        /// Gets all versions of this model ordered by version number.
        /// </summary>
        /// <returns>Read-only list of model versions</returns>
        public IReadOnlyList<ModelVersion> GetVersions()
        {
            return _versions.OrderBy(v => v.VersionNumber).ToList().AsReadOnly();
        }

        /// <summary>
        /// Gets a specific version by version number.
        /// </summary>
        /// <param name="versionNumber">The version number to retrieve</param>
        /// <returns>The model version, or null if not found</returns>
        public ModelVersion? GetVersion(int versionNumber)
        {
            return _versions.FirstOrDefault(v => v.VersionNumber == versionNumber);
        }

        /// <summary>
        /// Checks if this model has a specific version.
        /// </summary>
        /// <param name="versionNumber">The version number to check</param>
        /// <returns>True if the version exists</returns>
        public bool HasVersion(int versionNumber)
        {
            return _versions.Any(v => v.VersionNumber == versionNumber);
        }

        /// <summary>
        /// Soft deletes this model by marking it as deleted.
        /// </summary>
        /// <param name="deletedAt">When the model was deleted</param>
        public void SoftDelete(DateTime deletedAt)
        {
            IsDeleted = true;
            DeletedAt = deletedAt;
            UpdatedAt = deletedAt;
        }

        /// <summary>
        /// Restores a soft-deleted model.
        /// </summary>
        /// <param name="restoredAt">When the model was restored</param>
        public void Restore(DateTime restoredAt)
        {
            IsDeleted = false;
            DeletedAt = null;
            UpdatedAt = restoredAt;
        }
    }
}
