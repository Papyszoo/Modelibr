using System.Text.Json;

namespace Application.Extraction;

/// <summary>
/// Reads the worker-written per-part detail blob (<c>AssetPart.Detail</c>).
///
/// The column is free-form JSON on purpose - the worker adds fields ahead of the backend
/// knowing about them - so every read here is total: a missing field, a wrong shape or an
/// unparseable blob yields "nothing recorded", never an exception. A caller loses the detail
/// it asked about, not the whole read it was part of.
/// </summary>
public static class AssetPartDetail
{
    /// <summary>
    /// The part's authored material slot names, as extracted by the worker's scene-graph
    /// walk. These are the strings <c>apply_material</c>'s <c>slot</c> argument matches.
    /// </summary>
    public static IReadOnlyList<string> MaterialSlots(string? detail)
    {
        if (string.IsNullOrWhiteSpace(detail))
        {
            return Array.Empty<string>();
        }

        try
        {
            using var doc = JsonDocument.Parse(detail);
            if (doc.RootElement.ValueKind != JsonValueKind.Object ||
                !doc.RootElement.TryGetProperty("materialSlots", out var slots) ||
                slots.ValueKind != JsonValueKind.Array)
            {
                return Array.Empty<string>();
            }

            return slots.EnumerateArray()
                .Where(s => s.ValueKind == JsonValueKind.String)
                .Select(s => s.GetString() ?? string.Empty)
                .Where(s => s.Length > 0)
                .ToList();
        }
        catch (JsonException)
        {
            return Array.Empty<string>();
        }
    }
}
