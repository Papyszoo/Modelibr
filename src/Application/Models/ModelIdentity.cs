namespace Application.Models;

/// <summary>
/// The least a surface needs to name a model and show a picture of it: no tags, no packs,
/// no versions. Read in batches for list views that already know which ids they want.
/// </summary>
public sealed record ModelIdentity(int Id, string Name, int? ActiveVersionId);
