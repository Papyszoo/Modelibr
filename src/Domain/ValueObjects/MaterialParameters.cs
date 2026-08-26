namespace Domain.ValueObjects;

/// <summary>
/// The scalar half of a PBR material - everything a surface needs when there
/// are no image maps at all. Field names and ranges follow glTF 2.0's metallic
/// -roughness model, so a material round-trips through the viewport, a Blender
/// bake and an export without a translation table.
///
/// This is the piece that makes "matte black plastic, roughness 0.6" a thing
/// that can exist. A material carrying only these numbers is valid and complete.
/// </summary>
public sealed record MaterialParameters
{
    public const float DefaultIor = 1.5f;
    public const float DefaultAlphaCutoff = 0.5f;

    private MaterialParameters() { }

    /// <summary>Base colour, linear RGBA in 0..1 (glTF <c>baseColorFactor</c>).</summary>
    public float BaseColorR { get; private init; } = 1f;
    public float BaseColorG { get; private init; } = 1f;
    public float BaseColorB { get; private init; } = 1f;
    public float BaseColorA { get; private init; } = 1f;

    /// <summary>0 = mirror-smooth, 1 = fully diffuse (glTF <c>roughnessFactor</c>).</summary>
    public float Roughness { get; private init; } = 1f;

    /// <summary>0 = dielectric, 1 = metal (glTF <c>metallicFactor</c>).</summary>
    public float Metallic { get; private init; }

    /// <summary>Emitted colour, linear RGB in 0..1 (glTF <c>emissiveFactor</c>).</summary>
    public float EmissiveR { get; private init; }
    public float EmissiveG { get; private init; }
    public float EmissiveB { get; private init; }

    /// <summary>Multiplier on a normal map's effect. Meaningless without one, but harmless.</summary>
    public float NormalScale { get; private init; } = 1f;

    /// <summary>Multiplier on an occlusion map's effect, 0..1.</summary>
    public float OcclusionStrength { get; private init; } = 1f;

    /// <summary>Index of refraction, >= 1. 1.5 is glass and most dielectrics.</summary>
    public float Ior { get; private init; } = DefaultIor;

    public AlphaMode AlphaMode { get; private init; } = AlphaMode.Opaque;

    /// <summary>Only meaningful when <see cref="AlphaMode"/> is Mask.</summary>
    public float AlphaCutoff { get; private init; } = DefaultAlphaCutoff;

    /// <summary>Render back faces too - curtains, foliage cards, single-sided walls.</summary>
    public bool DoubleSided { get; private init; }

    /// <summary>
    /// A plain white dielectric. What a material is before anyone says anything
    /// about it, and a valid material in its own right.
    /// </summary>
    public static MaterialParameters Default => new();

    public static MaterialParameters Create(
        float baseColorR = 1f,
        float baseColorG = 1f,
        float baseColorB = 1f,
        float baseColorA = 1f,
        float roughness = 1f,
        float metallic = 0f,
        float emissiveR = 0f,
        float emissiveG = 0f,
        float emissiveB = 0f,
        float normalScale = 1f,
        float occlusionStrength = 1f,
        float ior = DefaultIor,
        AlphaMode alphaMode = AlphaMode.Opaque,
        float alphaCutoff = DefaultAlphaCutoff,
        bool doubleSided = false)
    {
        ValidateUnit(baseColorR, nameof(baseColorR));
        ValidateUnit(baseColorG, nameof(baseColorG));
        ValidateUnit(baseColorB, nameof(baseColorB));
        ValidateUnit(baseColorA, nameof(baseColorA));
        ValidateUnit(roughness, nameof(roughness));
        ValidateUnit(metallic, nameof(metallic));
        ValidateUnit(emissiveR, nameof(emissiveR));
        ValidateUnit(emissiveG, nameof(emissiveG));
        ValidateUnit(emissiveB, nameof(emissiveB));
        ValidateUnit(occlusionStrength, nameof(occlusionStrength));
        ValidateUnit(alphaCutoff, nameof(alphaCutoff));

        if (float.IsNaN(normalScale) || normalScale < 0f || normalScale > 10f)
            throw new ArgumentException("normalScale must be between 0 and 10.", nameof(normalScale));

        if (float.IsNaN(ior) || ior < 1f || ior > 3f)
            throw new ArgumentException("ior must be between 1 and 3.", nameof(ior));

        if (!Enum.IsDefined(alphaMode))
            throw new ArgumentException($"Unknown alpha mode '{alphaMode}'.", nameof(alphaMode));

        return new MaterialParameters
        {
            BaseColorR = baseColorR,
            BaseColorG = baseColorG,
            BaseColorB = baseColorB,
            BaseColorA = baseColorA,
            Roughness = roughness,
            Metallic = metallic,
            EmissiveR = emissiveR,
            EmissiveG = emissiveG,
            EmissiveB = emissiveB,
            NormalScale = normalScale,
            OcclusionStrength = occlusionStrength,
            Ior = ior,
            AlphaMode = alphaMode,
            AlphaCutoff = alphaCutoff,
            DoubleSided = doubleSided
        };
    }

    /// <summary>
    /// Builds parameters from an sRGB hex colour (<c>#RRGGBB</c> or <c>#RRGGBBAA</c>),
    /// converting to the linear space the factors are stored in. This is the path
    /// an agent takes when it means "warm off-white" and has picked a swatch.
    /// </summary>
    public static MaterialParameters FromHex(string hex, float roughness = 1f, float metallic = 0f)
    {
        var (r, g, b, a) = ParseHex(hex);

        return Create(
            SrgbToLinear(r),
            SrgbToLinear(g),
            SrgbToLinear(b),
            a,
            roughness,
            metallic);
    }

    /// <summary>The base colour as an sRGB <c>#RRGGBB</c> string, for display.</summary>
    public string ToHex()
    {
        static int Component(float linear) =>
            (int)Math.Round(Math.Clamp(LinearToSrgb(linear), 0f, 1f) * 255f);

        return $"#{Component(BaseColorR):X2}{Component(BaseColorG):X2}{Component(BaseColorB):X2}";
    }

    private static (float R, float G, float B, float A) ParseHex(string hex)
    {
        if (string.IsNullOrWhiteSpace(hex))
            throw new ArgumentException("Colour cannot be null or empty.", nameof(hex));

        var trimmed = hex.Trim().TrimStart('#');

        if (trimmed.Length != 6 && trimmed.Length != 8)
            throw new ArgumentException($"Colour '{hex}' must be #RRGGBB or #RRGGBBAA.", nameof(hex));

        static float Channel(string source, int index)
        {
            var slice = source.Substring(index, 2);
            if (!byte.TryParse(slice, System.Globalization.NumberStyles.HexNumber,
                    System.Globalization.CultureInfo.InvariantCulture, out var value))
                throw new ArgumentException($"Colour component '{slice}' is not hexadecimal.", nameof(source));

            return value / 255f;
        }

        return (
            Channel(trimmed, 0),
            Channel(trimmed, 2),
            Channel(trimmed, 4),
            trimmed.Length == 8 ? Channel(trimmed, 6) : 1f);
    }

    private static float SrgbToLinear(float value) =>
        value <= 0.04045f
            ? value / 12.92f
            : (float)Math.Pow((value + 0.055f) / 1.055f, 2.4f);

    private static float LinearToSrgb(float value) =>
        value <= 0.0031308f
            ? value * 12.92f
            : (float)(1.055f * Math.Pow(value, 1.0 / 2.4) - 0.055f);

    private static void ValidateUnit(float value, string name)
    {
        if (float.IsNaN(value) || value < 0f || value > 1f)
            throw new ArgumentException($"{name} must be between 0 and 1.", name);
    }
}
