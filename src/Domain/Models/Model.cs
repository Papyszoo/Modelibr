namespace Domain.Models
{
    public class Model
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public DateTime CreatedAt { get; set;  }
        public DateTime UpdatedAt { get; set; }
        
        // Navigation property for many-to-many relationship
        public ICollection<File> Files { get; set; } = new List<File>();
    }
}
