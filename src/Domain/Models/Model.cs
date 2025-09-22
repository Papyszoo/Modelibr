namespace Domain.Models
{
    public class Model
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
    }
}
