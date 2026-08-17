using Domain.Models;
using Domain.ValueObjects;

namespace Application.Materials;

/// <summary>
/// The scalar parameters, flattened for transport. Base colour also travels as
/// a hex string because that is what a colour picker and an agent both speak,
/// while the float factors are what the renderer needs.
/// </summary>
public record MaterialParametersDto(
    float BaseColorR,
    float BaseColorG,
    float BaseColorB,
    float BaseColorA,
    string BaseColorHex,
    float Roughness,
    float Metallic,
    float EmissiveR,
    float EmissiveG,
    float EmissiveB,
    float NormalScale,
    float OcclusionStrength,
    float Ior,
    AlphaMode AlphaMode,
    float AlphaCutoff,
    bool DoubleSided)
{
    public static MaterialParametersDto From(MaterialParameters parameters) => new(
        parameters.BaseColorR,
        parameters.BaseColorG,
        parameters.BaseColorB,
        parameters.BaseColorA,
        parameters.ToHex(),
        parameters.Roughness,
        parameters.Metallic,
        parameters.EmissiveR,
        parameters.EmissiveG,
        parameters.EmissiveB,
        parameters.NormalScale,
        parameters.OcclusionStrength,
        parameters.Ior,
        parameters.AlphaMode,
        parameters.AlphaCutoff,
        parameters.DoubleSided);
}

public record MaterialDto(
    int Id,
    string Name,
    string? Description,
    int? CategoryId,
    string? CategoryName,
    MaterialParametersDto Parameters,
    string PreviewGeometryType,
    bool RequiresUvs,
    IReadOnlyList<string> Tags,
    DateTime CreatedAt,
    DateTime UpdatedAt)
{
    public static MaterialDto From(Material material) => new(
        material.Id,
        material.Name,
        material.Description,
        material.CategoryId,
        material.Category?.Name,
        MaterialParametersDto.From(material.Parameters),
        material.PreviewGeometryType,
        material.RequiresUvs,
        material.Tags.Select(tag => tag.Name).OrderBy(name => name, StringComparer.OrdinalIgnoreCase).ToList(),
        material.CreatedAt,
        material.UpdatedAt);
}

/// <summary>
/// How a caller supplies parameters. Every field is optional: a request that
/// names only a colour gets defaults for the rest, which is the point - a
/// material must be cheap enough for an agent to invent one mid-scene.
/// <c>BaseColorHex</c> wins over the individual float components when both are
/// given, since it is the more deliberate of the two.
/// </summary>
public record MaterialParametersRequest(
    string? BaseColorHex = null,
    float? BaseColorR = null,
    float? BaseColorG = null,
    float? BaseColorB = null,
    float? BaseColorA = null,
    float? Roughness = null,
    float? Metallic = null,
    float? EmissiveR = null,
    float? EmissiveG = null,
    float? EmissiveB = null,
    float? NormalScale = null,
    float? OcclusionStrength = null,
    float? Ior = null,
    AlphaMode? AlphaMode = null,
    float? AlphaCutoff = null,
    bool? DoubleSided = null)
{
    /// <summary>
    /// Applies this request over a starting point - defaults when creating, the
    /// material's current parameters when updating, so a partial update is a
    /// patch rather than a silent reset of everything unmentioned.
    /// </summary>
    public MaterialParameters ApplyTo(MaterialParameters current)
    {
        // A hex colour is the deliberate one, so it wins outright: when it is
        // given the individual components are ignored rather than layered over
        // it. Leaving them to `??` inverted the documented precedence - a caller
        // sending both got the floats, which is how a picked colour silently
        // becomes a different one.
        var hexGiven = !string.IsNullOrWhiteSpace(BaseColorHex);
        var basis = hexGiven
            ? MaterialParameters.FromHex(BaseColorHex!, current.Roughness, current.Metallic)
            : current;

        return MaterialParameters.Create(
            hexGiven ? basis.BaseColorR : BaseColorR ?? basis.BaseColorR,
            hexGiven ? basis.BaseColorG : BaseColorG ?? basis.BaseColorG,
            hexGiven ? basis.BaseColorB : BaseColorB ?? basis.BaseColorB,
            BaseColorA ?? basis.BaseColorA,
            Roughness ?? current.Roughness,
            Metallic ?? current.Metallic,
            EmissiveR ?? current.EmissiveR,
            EmissiveG ?? current.EmissiveG,
            EmissiveB ?? current.EmissiveB,
            NormalScale ?? current.NormalScale,
            OcclusionStrength ?? current.OcclusionStrength,
            Ior ?? current.Ior,
            AlphaMode ?? current.AlphaMode,
            AlphaCutoff ?? current.AlphaCutoff,
            DoubleSided ?? current.DoubleSided);
    }
}
