using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Models;
using Domain.ValueObjects;
using SharedKernel;

namespace Application.Models
{
    internal class GetAllModelsQueryHandler : IQueryHandler<GetAllModelsQuery, GetAllModelsQueryResponse>
    {
        private readonly IModelRepository _modelRepository;

        public GetAllModelsQueryHandler(IModelRepository modelRepository)
        {
            _modelRepository = modelRepository;
        }

        public async Task<Result<GetAllModelsQueryResponse>> Handle(GetAllModelsQuery query, CancellationToken cancellationToken)
        {
            IEnumerable<ModelListDto> modelListDtos;
            int? totalCount = null;

            if (query.Page.HasValue && query.PageSize.HasValue)
            {
                var result = await _modelRepository.GetPagedListAsync(
                    query.Page.Value, query.PageSize.Value,
                    query.PackId, query.ProjectId, query.TextureSetId, query.CategoryId, query.HasConceptImages,
                    cancellationToken);
                modelListDtos = result.Items;
                totalCount = result.TotalCount;
            }
            else
            {
                var models = await _modelRepository.GetAllAsync(cancellationToken);

                // Filter by pack if specified
                if (query.PackId.HasValue)
                {
                    models = models.Where(m => m.Packs.Any(p => p.Id == query.PackId.Value));
                }

                // Filter by project if specified
                if (query.ProjectId.HasValue)
                {
                    models = models.Where(m => m.Projects.Any(p => p.Id == query.ProjectId.Value));
                }

                // Filter by texture set if specified
                if (query.TextureSetId.HasValue)
                {
                    models = models.Where(m => m.TextureSets.Any(ts => ts.Id == query.TextureSetId.Value));
                }

                if (query.CategoryId.HasValue)
                {
                    models = models.Where(m => m.ModelCategoryId == query.CategoryId.Value);
                }

                if (query.HasConceptImages.HasValue)
                {
                    models = query.HasConceptImages.Value
                        ? models.Where(m => m.ConceptImages.Any())
                        : models.Where(m => !m.ConceptImages.Any());
                }

                // NOTE: Keep this mapping in sync with ModelRepository.GetPagedListAsync
                modelListDtos = models.Select(m => new ModelListDto
                {
                    Id = m.Id,
                    Name = m.Name,
                    CreatedAt = m.CreatedAt,
                    UpdatedAt = m.UpdatedAt,
                    Tags = m.Tags,
                    Description = m.Description,
                    CategoryId = m.ModelCategoryId,
                    CategoryPath = ModelDtoMappings.BuildCategoryPath(m.ModelCategory),
                    ConceptImageCount = m.ConceptImages.Count,
                    HasConceptImages = m.ConceptImages.Any(),
                    ActiveVersionId = m.ActiveVersionId,
                    LatestVersionId = m.GetLatestVersion()?.Id,
                    LatestVersionNumber = m.GetLatestVersion()?.VersionNumber,
                    TriangleCount = m.GetLatestVersion()?.TriangleCount,
                    VertexCount = m.GetLatestVersion()?.VertexCount,
                    MeshCount = m.GetLatestVersion()?.MeshCount,
                    MaterialCount = m.GetLatestVersion()?.MaterialCount,
                    ThumbnailUrl = m.ActiveVersion?.Thumbnail?.Status == ThumbnailStatus.Ready 
                        ? $"/model-versions/{m.ActiveVersion.Id}/thumbnail/file?t={m.ActiveVersion.Thumbnail.UpdatedAt:yyyyMMddHHmmss}" 
                        : null,
                    PngThumbnailUrl = m.ActiveVersion?.Thumbnail?.Status == ThumbnailStatus.Ready && !string.IsNullOrEmpty(m.ActiveVersion.Thumbnail.PngThumbnailPath)
                        ? $"/model-versions/{m.ActiveVersion.Id}/thumbnail/png-file?t={m.ActiveVersion.Thumbnail.UpdatedAt:yyyyMMddHHmmss}" 
                        : null
                }).ToList();
            }

            int? totalPages = (totalCount.HasValue && query.PageSize.HasValue)
                ? (int)Math.Ceiling((double)totalCount.Value / query.PageSize.Value)
                : null;

            return Result.Success(new GetAllModelsQueryResponse(
                modelListDtos, totalCount, query.Page, query.PageSize, totalPages));
        }
    }

    public record GetAllModelsQuery(int? PackId = null, int? ProjectId = null, int? TextureSetId = null, int? CategoryId = null, bool? HasConceptImages = null, int? Page = null, int? PageSize = null) : IQuery<GetAllModelsQueryResponse>;
    
    public record GetAllModelsQueryResponse(IEnumerable<ModelListDto> Models, int? TotalCount = null, int? Page = null, int? PageSize = null, int? TotalPages = null);
    
    /// <summary>
    /// Minimal DTO for model list - contains only basic information and thumbnails needed for list views
    /// </summary>
    public record ModelListDto
    {
        public int Id { get; init; }
        public string Name { get; init; } = string.Empty;
        public DateTime CreatedAt { get; init; }
        public DateTime UpdatedAt { get; init; }
        public string? Tags { get; init; }
        public string? Description { get; init; }
        public int? CategoryId { get; init; }
        public string? CategoryPath { get; init; }
        public int ConceptImageCount { get; init; }
        public bool HasConceptImages { get; init; }
        public int? ActiveVersionId { get; init; }
        public int? LatestVersionId { get; init; }
        public int? LatestVersionNumber { get; init; }
        public int? TriangleCount { get; init; }
        public int? VertexCount { get; init; }
        public int? MeshCount { get; init; }
        public int? MaterialCount { get; init; }
        public string? ThumbnailUrl { get; init; }
        public string? PngThumbnailUrl { get; init; }
    }
}