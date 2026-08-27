using System.Text.Json;
using Domain.ValueObjects;

namespace Application.StoreImports;

/// <summary>
/// Store manifest (schema v1) → Modelibr domain mapping. This is the native (in-process)
/// port of the store repo's executable spec, <c>scripts/import-to-modelibr/lib/mapping.mjs</c>.
/// Every decision here mirrors that module; the differences are called out inline where the
/// store's JSON-over-HTTP shape and Modelibr's strongly-typed enums diverge.
/// </summary>
public static class StoreManifestMapping
{
    public const string ItemTypeModel = "Model";
    public const string ItemTypeTextureSet = "TextureSet";
    public const string ItemTypeSprite = "Sprite";
    public const string ItemTypeSound = "Sound";
    public const string ItemTypeEnvironmentMap = "EnvironmentMap";

    public enum RoleKind { Unknown, Mesh, Audio, Panorama, Image, Texture }

    public enum ImportTarget { Model, TextureSet, Sprite, Sound, EnvironmentMap, Unsupported }

    public sealed record ParsedRole(
        RoleKind Kind,
        string? Raw,
        TextureType TextureType = TextureType.Albedo,
        bool TextureTypeUnmapped = false,
        TextureChannel? SourceChannel = null);

    // Store file Role → Modelibr TextureType.
    private static readonly IReadOnlyDictionary<string, TextureType> TextureTypeMap =
        new Dictionary<string, TextureType>(StringComparer.Ordinal)
        {
            ["Albedo"] = TextureType.Albedo,
            ["Normal"] = TextureType.Normal,
            ["Roughness"] = TextureType.Roughness,
            ["Metallic"] = TextureType.Metallic,
            ["Height"] = TextureType.Height,
            ["AO"] = TextureType.AO,
            ["Specular"] = TextureType.Specular,
            ["Emissive"] = TextureType.Emissive,
            ["Opacity"] = TextureType.Alpha,
        };

    private static readonly IReadOnlyDictionary<string, TextureChannel> SourceChannelMap =
        new Dictionary<string, TextureChannel>(StringComparer.Ordinal)
        {
            ["R"] = TextureChannel.R,
            ["G"] = TextureChannel.G,
            ["B"] = TextureChannel.B,
            ["A"] = TextureChannel.A,
            ["RGB"] = TextureChannel.RGB,
            ["RGBA"] = TextureChannel.RGB,
        };

    public static ParsedRole ParseRole(string? role)
    {
        if (string.IsNullOrEmpty(role))
            return new ParsedRole(RoleKind.Unknown, role);

        switch (role)
        {
            case "Mesh":
                return new ParsedRole(RoleKind.Mesh, role);
            case "Audio":
                return new ParsedRole(RoleKind.Audio, role);
            case "Panorama":
                return new ParsedRole(RoleKind.Panorama, role);
            case "Image":
                return new ParsedRole(RoleKind.Image, role);
        }

        if (role.StartsWith("Texture:", StringComparison.Ordinal))
        {
            var parts = role.Split(':');
            var type = parts.Length > 1 ? parts[1] : string.Empty;
            var channel = parts.Length > 2 ? parts[2] : null;

            var mapped = TextureTypeMap.TryGetValue(type, out var textureType);
            var sourceChannel = channel is not null && SourceChannelMap.TryGetValue(channel, out var ch)
                ? (TextureChannel?)ch
                : null;

            return new ParsedRole(
                RoleKind.Texture,
                role,
                TextureType: mapped ? textureType : TextureType.Albedo,
                TextureTypeUnmapped: !mapped,
                SourceChannel: sourceChannel);
        }

        return new ParsedRole(RoleKind.Unknown, role);
    }

    public static string? MapLicense(string? license)
    {
        if (string.IsNullOrWhiteSpace(license))
            return null;

        var normalized = license.Trim().ToUpperInvariant();
        normalized = System.Text.RegularExpressions.Regex.Replace(normalized, "[\\s_]+", "-");

        return normalized switch
        {
            "CC0" => "CC0",
            "CC-BY" => "CC_BY",
            "CC-BY-4.0" => "CC_BY",
            "CC-BY-SA" => "CC_BY_SA",
            "MIT" => "MIT",
            "ROYALTY-FREE" => "RoyaltyFree",
            _ => license.Trim()
        };
    }

    public static string? MapSchemaLicense(string? license)
    {
        if (string.IsNullOrWhiteSpace(license))
            return null;

        var normalized = System.Text.RegularExpressions.Regex
            .Replace(license.Trim().ToUpperInvariant(), "[\\s_]+", "-");

        normalized = System.Text.RegularExpressions.Regex.Replace(normalized, "-[0-9]+(\\.[0-9]+)*$", "");

        return normalized switch
        {
            "CC0" or "CC-ZERO" or "PUBLIC-DOMAIN" => "CC0",
            "CC-BY" => "CC-BY",
            "CC-BY-SA" => "CC-BY-SA",
            "CC-BY-NC" => "CC-BY-NC",
            "CC-BY-ND" => "CC-BY-ND",
            "MIT" => "MIT",
            "APACHE" or "APACHE-2" => "Apache-2.0",
            "GPL" or "GPLV3" => "GPL-3.0",
            "ROYALTY-FREE" => "Royalty-Free",
            "PROPRIETARY" => "Proprietary",
            _ => "Custom"
        };
    }

    public static bool? RequiresAttribution(string? schemaLicense) => schemaLicense switch
    {
        "CC0" or "Royalty-Free" => false,
        "CC-BY" or "CC-BY-SA" or "CC-BY-NC" or "CC-BY-ND" or "MIT" or "Apache-2.0" or "GPL-3.0" => true,
        _ => null
    };

    public static string? GetItemFacets(string? metadataJson)
    {
        if (string.IsNullOrWhiteSpace(metadataJson))
            return null;

        try
        {
            using var doc = JsonDocument.Parse(metadataJson);
            if (doc.RootElement.ValueKind != JsonValueKind.Object
                || !doc.RootElement.TryGetProperty("spritesheet", out var sheet)
                || sheet.ValueKind != JsonValueKind.Object)
            {
                return null;
            }

            var facets = new Dictionary<string, object>(StringComparer.Ordinal);
            foreach (var (source, target) in SpritesheetFacetKeys)
            {
                if (!sheet.TryGetProperty(source, out var value)) continue;

                switch (value.ValueKind)
                {
                    case JsonValueKind.Number when value.TryGetInt32(out var number):
                        facets[target] = number;
                        break;
                    case JsonValueKind.String when !string.IsNullOrWhiteSpace(value.GetString()):
                        facets[target] = value.GetString()!.Trim();
                        break;
                }
            }

            return facets.Count == 0 ? null : JsonSerializer.Serialize(facets);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static readonly IReadOnlyList<(string Source, string Target)> SpritesheetFacetKeys = new[]
    {
        ("frameWidth", "frameWidth"),
        ("frameHeight", "frameHeight"),
        ("frameCount", "frameCount"),
        ("fps", "fps"),
        ("type", "spritesheetType"),
    };

    public static ImportTarget PlanForItem(string? itemType) => itemType switch
    {
        ItemTypeModel => ImportTarget.Model,
        ItemTypeTextureSet => ImportTarget.TextureSet,
        ItemTypeSound => ImportTarget.Sound,
        ItemTypeEnvironmentMap => ImportTarget.EnvironmentMap,
        ItemTypeSprite => ImportTarget.Sprite,
        _ => ImportTarget.Unsupported
    };

    public static string? GetItemCategory(string? metadataJson)
    {
        if (string.IsNullOrWhiteSpace(metadataJson))
            return null;

        try
        {
            using var doc = JsonDocument.Parse(metadataJson);
            if (doc.RootElement.ValueKind != JsonValueKind.Object
                || !doc.RootElement.TryGetProperty("category", out var element)
                || element.ValueKind != JsonValueKind.String)
            {
                return null;
            }

            var name = element.GetString();
            return string.IsNullOrWhiteSpace(name) ? null : name.Trim();
        }
        catch (JsonException)
        {
            return null;
        }
    }

    public static string? GetItemSubcategory(string? metadataJson)
    {
        if (string.IsNullOrWhiteSpace(metadataJson))
            return null;

        try
        {
            using var doc = JsonDocument.Parse(metadataJson);
            if (doc.RootElement.ValueKind != JsonValueKind.Object
                || !doc.RootElement.TryGetProperty("subcategory", out var element)
                || element.ValueKind != JsonValueKind.String)
            {
                return null;
            }

            var name = element.GetString();
            return string.IsNullOrWhiteSpace(name) ? null : name.Trim();
        }
        catch (JsonException)
        {
            return null;
        }
    }

    public static string? ResolveItemCategory(StoreManifestItem item)
        => !string.IsNullOrWhiteSpace(item.Category) ? item.Category.Trim() : GetItemCategory(item.MetadataJson);

    public static string? ResolveItemSubcategory(StoreManifestItem item)
        => !string.IsNullOrWhiteSpace(item.Subcategory) ? item.Subcategory.Trim() : GetItemSubcategory(item.MetadataJson);

    public static string ResolveItemDescription(StoreManifestItem item, StoreManifest manifest)
    {
        if (!string.IsNullOrWhiteSpace(item.Description))
            return item.Description.Trim();
        if (!string.IsNullOrWhiteSpace(manifest.Description))
            return manifest.Description.Trim();
        return item.Name;
    }

    public static IReadOnlyList<string> ResolveItemTags(StoreManifestItem item, StoreManifest manifest)
    {
        if (item.Tags is { Count: > 0 })
            return item.Tags;
        return manifest.Tags ?? Array.Empty<string>();
    }
}
