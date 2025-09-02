namespace Domain.Models
{
    public class Model
    {
        public int Id { get; set; }
        public string FilePath { get; set; } = string.Empty;
        public DateTime CreatedAt { get; set;  }
        public DateTime UpdatedAt { get; set; }
    }
}
