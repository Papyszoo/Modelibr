namespace Domain.Models;

/// <summary>
/// Shared contract for hierarchical category entities.
/// All category aggregates (EnvironmentMap, TextureSet, Sound, Sprite, Model)
/// share this shape: Id, Name, Description, ParentId, Children, Update, MoveTo.
/// </summary>
public interface IHierarchicalCategory<TSelf> where TSelf : class, IHierarchicalCategory<TSelf>
{
    int Id { get; }
    string Name { get; }
    string? Description { get; }
    int? ParentId { get; }
    ICollection<TSelf> Children { get; }

    void Update(string name, string? description, DateTime updatedAt);
    void MoveTo(int? parentId, DateTime updatedAt);
}
