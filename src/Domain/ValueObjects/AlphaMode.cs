namespace Domain.ValueObjects;

/// <summary>
/// How a material's alpha channel is interpreted when rendering.
/// Mirrors glTF 2.0's alphaMode, which is what the viewport and every
/// exporter already speak.
/// </summary>
public enum AlphaMode
{
    /// <summary>
    /// Fully opaque - alpha is ignored entirely. The default.
    /// </summary>
    Opaque = 0,

    /// <summary>
    /// Alpha is a cutoff: a fragment is drawn or discarded by comparing
    /// alpha against AlphaCutoff. What foliage cards and cut-out fences need.
    /// </summary>
    Mask = 1,

    /// <summary>
    /// Alpha blends the material over what is behind it. Glass, curtains, water.
    /// </summary>
    Blend = 2
}
