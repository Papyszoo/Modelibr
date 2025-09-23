using Domain.Events;

namespace Domain.Models
{
    public class Model : AggregateRoot
    {
        private readonly List<File> _files = new();

        public int Id { get; set; }
        public string Name { get; private set; } = string.Empty;
        public DateTime CreatedAt { get; private set; }
        public DateTime UpdatedAt { get; private set; }
        
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
    }
}
