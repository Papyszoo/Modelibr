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
    // GAP (docs/VISION.md): the store collapses height/displacement into "Height", so a
    // displacement map imports as Height. GAP: the store emits "Opacity" where Modelibr's
    // enum member is "Alpha" - remapped here.
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

    // Store source-channel suffix (e.g. "Texture:Roughness:R") → Modelibr TextureChannel.
    // DEVIATION FROM mapping.mjs: the JS SOURCE_CHANNEL_MAP maps the suffix to long names
    // ("Red"/"Green"/…) it POSTs as strings. Modelibr's TextureChannel enum members are the
    // short forms (R/G/B/A/RGB) and there is no RGBA member, so this native port binds the
    // raw suffix straight to the enum. "RGBA" (which the store lists but Modelibr lacks)
    // falls back to RGB.
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

    /// <summary>Parses a store file Role into a structured descriptor (port of parseRole).</summary>
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

    /// <summary>
    /// Maps a store license string onto Modelibr's pack LicenseType string (port of mapLicense).
    /// Modelibr's pack LicenseType is a free string column, so unknown values pass through.
    /// </summary>
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

    /// <summary>The Modelibr import target for a manifest item, given its type (port of planForItem).</summary>
    public static ImportTarget PlanForItem(string? itemType) => itemType switch
    {
        ItemTypeModel => ImportTarget.Model,
        ItemTypeTextureSet => ImportTarget.TextureSet,
        ItemTypeSound => ImportTarget.Sound,
        ItemTypeEnvironmentMap => ImportTarget.EnvironmentMap,
        ItemTypeSprite => ImportTarget.Sprite,
        // GAP (docs/VISION.md): PackItemType.Other has no Modelibr home; skipped and reported.
        _ => ImportTarget.Unsupported
    };

    /// <summary>
    /// Reads the optional "category" name from an item's metadataJson - the read side of the
    /// store's CategoryTaxonomy.ValidateItemCategory (taxonomy v1: categories travel as
    /// <c>{"category": "Name"}</c>). Tolerant by design: missing, blank, non-object or
    /// malformed metadata yields null; metadata must never fail an import.
    /// </summary>
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
}
