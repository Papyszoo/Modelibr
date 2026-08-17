using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Models;
using Domain.ValueObjects;
using SharedKernel;

namespace Application.Materials;

/// <summary>
/// The merged browse surface: parameter materials and tiling global materials in
/// one list, because both attach to a model's material slot and a user shopping
/// for "oak" should not have to know which mechanism supplies it.
///
/// This is the single place the two tables are joined. Every other caller - the
/// grid, search, the scene's slot picker - reads it rather than unioning again,
/// which is the whole mitigation for keeping the two as separate entities.
/// </summary>
public record GetMaterialLibraryQuery(
    IReadOnlyCollection<int>? CategoryIds = null,
    string? SearchName = null,
    bool? RequiresUvs = null,
    int? Page = null,
    int? PageSize = null) : IQuery<GetMaterialLibraryResponse>;

public record GetMaterialLibraryResponse(
    IReadOnlyList<MaterialLibraryEntryDto> Entries,
    int TotalCount,
    int? Page = null,
    int? PageSize = null,
    int? TotalPages = null);

/// <summary>
/// One entry in the merged surface. <c>Kind</c> says which table it came from and
/// <c>RequiresUvs</c> says what that means in practice - the only distinction a
/// caller should ever need to act on.
/// </summary>
public record MaterialLibraryEntryDto(
    MaterialLibraryEntryKind Kind,
    int Id,
    string Name,
    string? Description,
    int? CategoryId,
    string? CategoryName,
    bool RequiresUvs,
    string PreviewGeometryType,
    bool HasThumbnail,
    MaterialParametersDto? Parameters,
    MaterialTilingDto? Tiling,
    IReadOnlyList<string> Tags,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public enum MaterialLibraryEntryKind
{
    /// <summary>A parameters-only material. Needs no UVs and no files.</summary>
    Material = 0,

    /// <summary>A Universal texture set - tiling image channels. Needs UVs.</summary>
    GlobalMaterial = 1
}

public record MaterialTilingDto(
    float TilingScaleX,
    float TilingScaleY,
    UvMappingMode UvMappingMode,
    float UvScale,
    int ChannelCount);

internal sealed class GetMaterialLibraryQueryHandler
    : IQueryHandler<GetMaterialLibraryQuery, GetMaterialLibraryResponse>
{
    private readonly IMaterialRepository _materialRepository;
    private readonly ITextureSetRepository _textureSetRepository;

    public GetMaterialLibraryQueryHandler(
        IMaterialRepository materialRepository,
        ITextureSetRepository textureSetRepository)
    {
        _materialRepository = materialRepository;
        _textureSetRepository = textureSetRepository;
    }

    public async Task<Result<GetMaterialLibraryResponse>> Handle(
        GetMaterialLibraryQuery query,
        CancellationToken cancellationToken)
    {
        var entries = new List<MaterialLibraryEntryDto>();

        // Both sides are fetched whole and merged in memory rather than paged
        // separately - page 2 of a merge is not the merge of the two page 2s.
        // Fine while a library holds hundreds of materials; if one ever holds
        // tens of thousands this needs a database-side union view instead.
        if (query.RequiresUvs != true)
        {
            var materials = await _materialRepository.GetAllAsync(cancellationToken);
            entries.AddRange(materials.Select(ToEntry));
        }

        if (query.RequiresUvs != false)
        {
            var (textureSets, _) = await _textureSetRepository.GetPagedAsync(
                page: 1,
                pageSize: int.MaxValue,
                kind: TextureSetKind.Universal,
                cancellationToken: cancellationToken);
            entries.AddRange(textureSets.Select(ToEntry));
        }

        IEnumerable<MaterialLibraryEntryDto> filtered = entries;

        if (query.CategoryIds is { Count: > 0 })
            filtered = filtered.Where(e => e.CategoryId.HasValue && query.CategoryIds.Contains(e.CategoryId.Value));

        if (!string.IsNullOrWhiteSpace(query.SearchName))
        {
            var search = query.SearchName.Trim();
            filtered = filtered.Where(e => e.Name.Contains(search, StringComparison.OrdinalIgnoreCase));
        }

        var ordered = filtered
            .OrderBy(e => e.Name, StringComparer.OrdinalIgnoreCase)
            .ThenBy(e => e.Kind)
            .ThenBy(e => e.Id)
            .ToList();

        var totalCount = ordered.Count;

        if (query.Page is { } page2 && query.PageSize is { } pageSize && pageSize > 0)
        {
            var paged = ordered.Skip((page2 - 1) * pageSize).Take(pageSize).ToList();
            var totalPages = (int)Math.Ceiling((double)totalCount / pageSize);

            return Result.Success(new GetMaterialLibraryResponse(paged, totalCount, page2, pageSize, totalPages));
        }

        return Result.Success(new GetMaterialLibraryResponse(ordered, totalCount));
    }

    private static MaterialLibraryEntryDto ToEntry(Material material) => new(
        MaterialLibraryEntryKind.Material,
        material.Id,
        material.Name,
        material.Description,
        material.CategoryId,
        material.Category?.Name,
        material.RequiresUvs,
        material.PreviewGeometryType,
        !string.IsNullOrWhiteSpace(material.ThumbnailPath) || !string.IsNullOrWhiteSpace(material.PngThumbnailPath),
        MaterialParametersDto.From(material.Parameters),
        Tiling: null,
        material.Tags.Select(tag => tag.Name).OrderBy(name => name, StringComparer.OrdinalIgnoreCase).ToList(),
        material.CreatedAt,
        material.UpdatedAt);

    private static MaterialLibraryEntryDto ToEntry(TextureSet textureSet) => new(
        MaterialLibraryEntryKind.GlobalMaterial,
        textureSet.Id,
        textureSet.Name,
        Description: null,
        textureSet.TextureSetCategoryId,
        textureSet.Category?.Name,
        // A tiling texture is only as good as the UV layout it lands on. This is
        // the flag that lets an agent avoid putting one on a badly-unwrapped asset.
        RequiresUvs: true,
        textureSet.PreviewGeometryType,
        !string.IsNullOrWhiteSpace(textureSet.ThumbnailPath) || !string.IsNullOrWhiteSpace(textureSet.PngThumbnailPath),
        Parameters: null,
        new MaterialTilingDto(
            textureSet.TilingScaleX,
            textureSet.TilingScaleY,
            textureSet.UvMappingMode,
            textureSet.UvScale,
            textureSet.Textures.Count),
        textureSet.Tags.Select(tag => tag.Name).OrderBy(name => name, StringComparer.OrdinalIgnoreCase).ToList(),
        textureSet.CreatedAt,
        textureSet.UpdatedAt);
}
