using System.Text.Json.Serialization;

namespace Domain.ValueObjects;

/// <summary>
/// How a material's alpha channel is interpreted when rendering.
/// Mirrors glTF 2.0's alphaMode, which is what the viewport and every
/// exporter already speak.
/// </summary>
/// <remarks>
/// Serialized by name, unlike most enums in this API, because everything else in
/// this feature already speaks the glTF names: the column stores them as text, the
/// MCP tools parse and list them with <c>Enum.GetNames</c>, and the frontend types
/// them as a string union. Only the REST serializer disagreed, and it sent
/// <c>alphaMode: 0</c> to a client comparing against "Opaque" - so a transparent
/// material never read as transparent anywhere in the app.
/// </remarks>
[JsonConverter(typeof(JsonStringEnumConverter<AlphaMode>))]
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
