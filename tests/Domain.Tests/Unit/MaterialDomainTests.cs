using Domain.Models;
using Domain.ValueObjects;
using Xunit;

namespace Domain.Tests.Unit;

/// <summary>
/// The Material aggregate and its parameters. The case that matters most here is
/// the one the whole type exists for: a material with no image maps at all is
/// valid and complete, because that is the only thing that can dress a library of
/// untextured grey assets.
/// </summary>
public class MaterialDomainTests
{
    private static readonly DateTime Now = new(2026, 8, 17, 12, 0, 0, DateTimeKind.Utc);

    [Fact]
    public void Create_WithParametersOnly_IsValid()
    {
        var material = Material.Create("Matte Black Plastic", MaterialParameters.Create(
            baseColorR: 0.02f, baseColorG: 0.02f, baseColorB: 0.02f, roughness: 0.6f), Now);

        Assert.Equal("Matte Black Plastic", material.Name);
        Assert.Equal(0.6f, material.Parameters.Roughness);
        Assert.False(material.RequiresUvs);
    }

    [Fact]
    public void RequiresUvs_IsAlwaysFalse()
    {
        // The discriminator the merged browse surface carries. A material is
        // numbers; there is nothing for a UV layout to address.
        var material = Material.Create("Anything", MaterialParameters.Default, Now);

        Assert.False(material.RequiresUvs);
    }

    [Fact]
    public void Default_IsAPlainWhiteDielectric()
    {
        var parameters = MaterialParameters.Default;

        Assert.Equal(1f, parameters.BaseColorR);
        Assert.Equal(1f, parameters.BaseColorA);
        Assert.Equal(1f, parameters.Roughness);
        Assert.Equal(0f, parameters.Metallic);
        Assert.Equal(AlphaMode.Opaque, parameters.AlphaMode);
        Assert.False(parameters.DoubleSided);
    }

    [Theory]
    [InlineData(-0.1f)]
    [InlineData(1.1f)]
    [InlineData(float.NaN)]
    public void Create_RejectsOutOfRangeRoughness(float roughness)
    {
        Assert.Throws<ArgumentException>(() => MaterialParameters.Create(roughness: roughness));
    }

    [Theory]
    [InlineData(0.99f)]
    [InlineData(3.01f)]
    public void Create_RejectsImpossibleIor(float ior)
    {
        // Below 1 is not physical; above 3 is beyond any material anyone will
        // author here and is far more likely to be a typo for 1.5.
        Assert.Throws<ArgumentException>(() => MaterialParameters.Create(ior: ior));
    }

    [Fact]
    public void FromHex_ConvertsSrgbToLinear()
    {
        // Mid grey in sRGB is not 0.5 in linear space. Storing the sRGB value
        // directly is the classic way to get a material that renders too bright.
        var parameters = MaterialParameters.FromHex("#808080");

        Assert.InRange(parameters.BaseColorR, 0.21f, 0.22f);
        Assert.Equal(parameters.BaseColorR, parameters.BaseColorG);
        Assert.Equal(parameters.BaseColorR, parameters.BaseColorB);
        Assert.Equal(1f, parameters.BaseColorA);
    }

    [Theory]
    [InlineData("#FFFFFF")]
    [InlineData("#000000")]
    [InlineData("#C08040")]
    public void FromHex_RoundTripsThroughToHex(string hex)
    {
        Assert.Equal(hex, MaterialParameters.FromHex(hex).ToHex());
    }

    [Fact]
    public void FromHex_AcceptsAlpha()
    {
        var parameters = MaterialParameters.FromHex("#FFFFFF80");

        Assert.InRange(parameters.BaseColorA, 0.5f, 0.503f);
    }

    [Theory]
    [InlineData("")]
    [InlineData("#FFF")]
    [InlineData("#GGGGGG")]
    public void FromHex_RejectsMalformedColour(string hex)
    {
        Assert.Throws<ArgumentException>(() => MaterialParameters.FromHex(hex));
    }

    [Fact]
    public void Create_RejectsEmptyName()
    {
        Assert.Throws<ArgumentException>(() =>
            Material.Create("  ", MaterialParameters.Default, Now));
    }

    [Fact]
    public void Create_DefaultsPreviewGeometryToSphere()
    {
        // TextureSet defaults to a plane because a tiling texture is judged by
        // how it repeats. A material is judged by how light rolls off it.
        Assert.Equal("sphere", Material.Create("X", MaterialParameters.Default, Now).PreviewGeometryType);
    }

    [Fact]
    public void Create_RejectsUnknownPreviewGeometry()
    {
        Assert.Throws<ArgumentException>(() =>
            Material.Create("X", MaterialParameters.Default, Now, previewGeometryType: "dodecahedron"));
    }

    [Fact]
    public void UpdateParameters_ReplacesThemWholesale()
    {
        var material = Material.Create("Oak", MaterialParameters.Default, Now);
        var later = Now.AddMinutes(5);

        material.UpdateParameters(MaterialParameters.Create(roughness: 0.3f, metallic: 1f), later);

        Assert.Equal(0.3f, material.Parameters.Roughness);
        Assert.Equal(1f, material.Parameters.Metallic);
        Assert.Equal(later, material.UpdatedAt);
    }

    [Fact]
    public void SoftDelete_ThenRestore_ClearsTheDeletionStamp()
    {
        var material = Material.Create("Oak", MaterialParameters.Default, Now);

        material.SoftDelete(Now.AddMinutes(1));
        Assert.True(material.IsDeleted);
        Assert.NotNull(material.DeletedAt);

        material.Restore(Now.AddMinutes(2));
        Assert.False(material.IsDeleted);
        Assert.Null(material.DeletedAt);
    }
}
