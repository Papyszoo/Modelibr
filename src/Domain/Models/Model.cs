using Domain.Events;
using Domain.ValueObjects;

namespace Domain.Models
{
    public class Model : AggregateRoot
    {
        private readonly List<File> _files = new();
        private readonly List<TextureSet> _textureSets = new();
        private readonly List<Pack> _packs = new();

        public int Id { get; set; }
        public string Name { get; private set; } = string.Empty;
        public DateTime CreatedAt { get; private set; }
        public DateTime UpdatedAt { get; private set; }
        public string? Tags { get; private set; }
        public string? Description { get; private set; }
        public int? DefaultTextureSetId { get; private set; }
        public int? Vertices { get; private set; }
        public int? Faces { get; private set; }
        public PolyCount PolyCount { get; private set; } = PolyCount.Unknown;
        
        // Navigation property for many-to-many relationship - EF Core requires this to be settable
        public ICollection<File> Files 
        { 
            get => _files; 
            set 
            {
                _files.Clear();
                if (value != null)
                    _files.AddRange(value);
            }
        }

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

        // Navigation property for one-to-one relationship with thumbnail
        public Thumbnail? Thumbnail { get; set; }

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

        public void AddFile(File file, DateTime updatedAt)
        {
            if (file == null)
                throw new ArgumentNullException(nameof(file));

            if (_files.Any(f => f.Sha256Hash == file.Sha256Hash))
                return; // File already exists, do nothing

            _files.Add(file);
            UpdatedAt = updatedAt;
        }

        public bool HasFile(string sha256Hash)
        {
            if (string.IsNullOrWhiteSpace(sha256Hash))
                return false;

            return _files.Any(f => f.Sha256Hash == sha256Hash);
        }

        /// <summary>
        /// Sets the thumbnail for this model.
        /// </summary>
        /// <param name="thumbnail">The thumbnail to associate with this model</param>
        public void SetThumbnail(Thumbnail thumbnail)
        {
            if (thumbnail == null)
                throw new ArgumentNullException(nameof(thumbnail));

            Thumbnail = thumbnail;
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
        /// <param name="modelHash">The SHA256 hash of the uploaded model file</param>
        /// <param name="isNewModel">Whether this is a new model or an existing one</param>
        public void RaiseModelUploadedEvent(string modelHash, bool isNewModel)
        {
            if (string.IsNullOrWhiteSpace(modelHash))
                throw new ArgumentException("Model hash cannot be null or empty.", nameof(modelHash));

            RaiseDomainEvent(new ModelUploadedEvent(Id, modelHash, isNewModel));
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
        /// Sets the model's geometry metadata (vertices and faces count).
        /// Automatically calculates and sets the PolyCount category based on face count.
        /// </summary>
        /// <param name="vertices">Number of vertices in the model</param>
        /// <param name="faces">Number of faces/polygons in the model</param>
        /// <param name="updatedAt">When the metadata was set</param>
        public void SetGeometryMetadata(int? vertices, int? faces, DateTime updatedAt)
        {
            Vertices = vertices;
            Faces = faces;
            PolyCount = CalculatePolyCount(faces);
            UpdatedAt = updatedAt;
        }

        private static PolyCount CalculatePolyCount(int? faces)
        {
            if (!faces.HasValue || faces.Value <= 0)
                return PolyCount.Unknown;

            // Low poly: up to 10,000 faces
            // Detailed: more than 10,000 faces
            return faces.Value <= 10_000 ? PolyCount.LowPoly : PolyCount.Detailed;
        }
    }
}
