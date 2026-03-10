namespace Domain.Models;

/// <summary>
/// Explicit join entity linking a ModelVersion to a TextureSet for a specific material slot within a variant.
/// MaterialName identifies which material in the 3D model this texture set applies to.
/// VariantName groups texture-set-to-material mappings into named configurations (e.g. "Default", "Battle Damaged").
/// An empty MaterialName means the texture set applies to all materials (legacy/default behavior).
/// An empty VariantName means the mapping belongs to the default variant.
/// </summary>
public class ModelVersionTextureSet
{
    public int ModelVersionId { get; private set; }
    public int TextureSetId { get; private set; }
    public string MaterialName { get; private set; } = string.Empty;
    public string VariantName { get; private set; } = string.Empty;

    // Navigation properties
    public ModelVersion ModelVersion { get; set; } = null!;
    public TextureSet TextureSet { get; set; } = null!;

    private ModelVersionTextureSet() { }

    public static ModelVersionTextureSet Create(int modelVersionId, int textureSetId, string materialName, string variantName = "")
    {
        return new ModelVersionTextureSet
        {
            ModelVersionId = modelVersionId,
            TextureSetId = textureSetId,
            MaterialName = materialName ?? string.Empty,
            VariantName = variantName ?? string.Empty
        };
    }
}
