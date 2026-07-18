using Application.StoreImports;
using Domain.ValueObjects;
using Xunit;

namespace Application.Tests.StoreImports;

public class StoreManifestMappingTests
{
    [Theory]
    [InlineData("Mesh", StoreManifestMapping.RoleKind.Mesh)]
    [InlineData("Audio", StoreManifestMapping.RoleKind.Audio)]
    [InlineData("Panorama", StoreManifestMapping.RoleKind.Panorama)]
    [InlineData("Image", StoreManifestMapping.RoleKind.Image)]
    [InlineData("Something", StoreManifestMapping.RoleKind.Unknown)]
    [InlineData(null, StoreManifestMapping.RoleKind.Unknown)]
    public void ParseRole_When_NonTextureRole_Returns_ExpectedKind(string? role, StoreManifestMapping.RoleKind expected)
    {
        var parsed = StoreManifestMapping.ParseRole(role);
        Assert.Equal(expected, parsed.Kind);
    }

    [Theory]
    [InlineData("Texture:Albedo", TextureType.Albedo)]
    [InlineData("Texture:Normal", TextureType.Normal)]
    [InlineData("Texture:Roughness", TextureType.Roughness)]
    [InlineData("Texture:Metallic", TextureType.Metallic)]
    [InlineData("Texture:Height", TextureType.Height)]
    [InlineData("Texture:AO", TextureType.AO)]
    [InlineData("Texture:Specular", TextureType.Specular)]
    [InlineData("Texture:Emissive", TextureType.Emissive)]
    public void ParseRole_When_TextureRole_MapsTextureType(string role, TextureType expected)
    {
        var parsed = StoreManifestMapping.ParseRole(role);

        Assert.Equal(StoreManifestMapping.RoleKind.Texture, parsed.Kind);
        Assert.Equal(expected, parsed.TextureType);
        Assert.False(parsed.TextureTypeUnmapped);
    }

    [Fact]
    public void ParseRole_When_Opacity_MapsTo_Alpha()
    {
        // GAP: the store emits "Opacity" where Modelibr's enum member is "Alpha".
        var parsed = StoreManifestMapping.ParseRole("Texture:Opacity");

        Assert.Equal(StoreManifestMapping.RoleKind.Texture, parsed.Kind);
        Assert.Equal(TextureType.Alpha, parsed.TextureType);
        Assert.False(parsed.TextureTypeUnmapped);
    }

    [Theory]
    [InlineData("Texture:Roughness:R", TextureType.Roughness, TextureChannel.R)]
    [InlineData("Texture:Metallic:G", TextureType.Metallic, TextureChannel.G)]
    [InlineData("Texture:AO:B", TextureType.AO, TextureChannel.B)]
    [InlineData("Texture:Height:A", TextureType.Height, TextureChannel.A)]
    [InlineData("Texture:Albedo:RGB", TextureType.Albedo, TextureChannel.RGB)]
    [InlineData("Texture:Albedo:RGBA", TextureType.Albedo, TextureChannel.RGB)]
    public void ParseRole_When_ChannelSuffix_MapsSourceChannel(string role, TextureType expectedType, TextureChannel expectedChannel)
    {
        var parsed = StoreManifestMapping.ParseRole(role);

        Assert.Equal(expectedType, parsed.TextureType);
        Assert.Equal(expectedChannel, parsed.SourceChannel);
    }

    [Fact]
    public void ParseRole_When_TextureType_Unknown_FallsBackToAlbedo_AndFlags()
    {
        var parsed = StoreManifestMapping.ParseRole("Texture:Sheen");

        Assert.Equal(StoreManifestMapping.RoleKind.Texture, parsed.Kind);
        Assert.Equal(TextureType.Albedo, parsed.TextureType);
        Assert.True(parsed.TextureTypeUnmapped);
    }

    [Fact]
    public void ParseRole_When_TextureNoChannel_HasNullChannel()
    {
        var parsed = StoreManifestMapping.ParseRole("Texture:Albedo");
        Assert.Null(parsed.SourceChannel);
    }

    [Theory]
    [InlineData("CC0", "CC0")]
    [InlineData("cc0", "CC0")]
    [InlineData("CC-BY", "CC_BY")]
    [InlineData("CC BY 4.0", "CC_BY")]
    [InlineData("CC-BY-SA", "CC_BY_SA")]
    [InlineData("MIT", "MIT")]
    [InlineData("Royalty Free", "RoyaltyFree")]
    [InlineData("Custom-License", "Custom-License")]
    public void MapLicense_NormalizesKnownValues_AndPassesThroughUnknown(string input, string expected)
    {
        Assert.Equal(expected, StoreManifestMapping.MapLicense(input));
    }

    [Fact]
    public void MapLicense_When_NullOrWhitespace_ReturnsNull()
    {
        Assert.Null(StoreManifestMapping.MapLicense(null));
        Assert.Null(StoreManifestMapping.MapLicense("   "));
    }

    [Theory]
    [InlineData("Model", StoreManifestMapping.ImportTarget.Model)]
    [InlineData("TextureSet", StoreManifestMapping.ImportTarget.TextureSet)]
    [InlineData("Sprite", StoreManifestMapping.ImportTarget.Sprite)]
    [InlineData("Sound", StoreManifestMapping.ImportTarget.Sound)]
    [InlineData("EnvironmentMap", StoreManifestMapping.ImportTarget.EnvironmentMap)]
    [InlineData("Other", StoreManifestMapping.ImportTarget.Unsupported)]
    [InlineData("Whatever", StoreManifestMapping.ImportTarget.Unsupported)]
    public void PlanForItem_MapsItemTypeToTarget(string itemType, StoreManifestMapping.ImportTarget expected)
    {
        Assert.Equal(expected, StoreManifestMapping.PlanForItem(itemType));
    }

    [Theory]
    [InlineData("""{"category": "Impacts & Hits"}""", "Impacts & Hits")]
    [InlineData("""{"category": "  UI  "}""", "UI")]
    [InlineData("""{"category": "Music", "other": 1}""", "Music")]
    public void GetItemCategory_ReadsCategoryFromMetadata(string metadataJson, string expected)
    {
        Assert.Equal(expected, StoreManifestMapping.GetItemCategory(metadataJson));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("{}")]
    [InlineData("""{"category": null}""")]
    [InlineData("""{"category": ""}""")]
    [InlineData("""{"category": 42}""")]
    [InlineData("""["category"]""")]
    [InlineData("not json at all")]
    public void GetItemCategory_ToleratesMissingOrMalformedMetadata(string? metadataJson)
    {
        // Metadata is enrichment — anything unreadable must yield null, never throw.
        Assert.Null(StoreManifestMapping.GetItemCategory(metadataJson));
    }
}
