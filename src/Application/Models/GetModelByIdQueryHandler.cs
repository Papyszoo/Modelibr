using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Extraction;
using Domain.Models;
using SharedKernel;

namespace Application.Models
{
    internal class GetModelByIdQueryHandler : IQueryHandler<GetModelByIdQuery, GetModelByIdQueryResponse>
    {
        private readonly IModelRepository _modelRepository;
        private readonly IAssetExtractionRepository _assetExtractionRepository;

        public GetModelByIdQueryHandler(
            IModelRepository modelRepository,
            IAssetExtractionRepository assetExtractionRepository)
        {
            _modelRepository = modelRepository;
            _assetExtractionRepository = assetExtractionRepository;
        }

        public async Task<Result<GetModelByIdQueryResponse>> Handle(GetModelByIdQuery query, CancellationToken cancellationToken)
        {
            var model = await _modelRepository.GetByIdAsync(query.ModelId, cancellationToken);
            
            if (model == null)
            {
                return Result.Failure<GetModelByIdQueryResponse>(
                    new Error("ModelNotFound", $"Model with ID {query.ModelId} was not found."));
            }

            var latestVersion = model.GetLatestVersion();
            var animationMetadata = await ReadAnimationMetadataAsync(model.Id, latestVersion, cancellationToken);

            var modelDetailDto = new ModelDetailDto
            {
                Id = model.Id,
                Name = model.Name,
                CreatedAt = model.CreatedAt,
                UpdatedAt = model.UpdatedAt,
                Tags = ModelDtoMappings.ToTagNames(model.Tags),
                Description = model.Description,
                Category = model.ModelCategory == null ? null : new ModelCategorySummaryDto
                {
                    Id = model.ModelCategory.Id,
                    Name = model.ModelCategory.Name,
                    Description = model.ModelCategory.Description,
                    ParentId = model.ModelCategory.ParentId,
                    Path = ModelDtoMappings.BuildCategoryPath(model.ModelCategory) ?? model.ModelCategory.Name
                },
                ConceptImages = model.ConceptImages
                    .OrderBy(ci => ci.SortOrder)
                    .Select(ModelDtoMappings.ToConceptImageDto)
                    .ToList(),
                TechnicalMetadata = ModelDtoMappings.ToTechnicalMetadataDto(latestVersion, animationMetadata),
                ActiveVersionId = model.ActiveVersionId,
                ThumbnailUrl = model.ActiveVersion?.Thumbnail?.Status == Domain.ValueObjects.ThumbnailStatus.Ready 
                    ? $"/model-versions/{model.ActiveVersion.Id}/thumbnail/file?t={model.ActiveVersion.Thumbnail.UpdatedAt:yyyyMMddHHmmss}" 
                    : null,
                PngThumbnailUrl = model.ActiveVersion?.Thumbnail?.Status == Domain.ValueObjects.ThumbnailStatus.Ready && !string.IsNullOrEmpty(model.ActiveVersion.Thumbnail.PngThumbnailPath)
                    ? $"/model-versions/{model.ActiveVersion.Id}/thumbnail/png-file?t={model.ActiveVersion.Thumbnail.UpdatedAt:yyyyMMddHHmmss}" 
                    : null,
                Files = (model.ActiveVersion?.Files ?? Array.Empty<Domain.Models.File>()).Select(f => new FileDto
                {
                    Id = f.Id,
                    OriginalFileName = f.OriginalFileName,
                    MimeType = f.MimeType,
                    FileType = f.FileType,
                    IsRenderable = f.FileType.IsRenderable,
                    SizeBytes = f.SizeBytes
                }).ToList(),
                Packs = model.Packs.Select(p => new PackSummaryDto
                {
                    Id = p.Id,
                    Name = p.Name
                }).ToList(),
                Projects = model.Projects.Select(p => new ProjectSummaryDto
                {
                    Id = p.Id,
                    Name = p.Name
                }).ToList(),
                TextureSets = model.TextureSets.Select(ts => new TextureSetSummaryDto
                {
                    Id = ts.Id,
                    Name = ts.Name
                }).ToList()
            };

            return Result.Success(new GetModelByIdQueryResponse(modelDetailDto));
        }

        /// <summary>
        /// Clips and shape keys live in the version's raw extraction payload, not
        /// in a column; this resolves the newest row for that version. Best-effort:
        /// a missing row or payload reads as "nothing recorded".
        /// </summary>
        private async Task<ModelAnimationMetadata> ReadAnimationMetadataAsync(
            int modelId,
            ModelVersion? latestVersion,
            CancellationToken cancellationToken)
        {
            if (latestVersion is null)
            {
                return ModelAnimationMetadata.Empty;
            }

            var extraction = await _assetExtractionRepository.GetLatestForAssetAsync(
                ExtractionAssetTypes.Model, modelId, latestVersion.Id, cancellationToken);

            return ModelAnimationMetadata.Parse(extraction?.RawPayload);
        }
    }

    public record GetModelByIdQuery(int ModelId) : IQuery<GetModelByIdQueryResponse>;
    
    public record GetModelByIdQueryResponse(ModelDetailDto Model);

    /// <summary>
    /// Detailed DTO for single model - contains all related files, packs, projects, and texture sets
    /// </summary>
    public record ModelDetailDto
    {
        public int Id { get; init; }
        public string Name { get; init; } = string.Empty;
        public DateTime CreatedAt { get; init; }
        public DateTime UpdatedAt { get; init; }
        public IReadOnlyList<string> Tags { get; init; } = Array.Empty<string>();
        public string? Description { get; init; }
        public ModelCategorySummaryDto? Category { get; init; }
        public ICollection<ModelConceptImageDto> ConceptImages { get; init; } = new List<ModelConceptImageDto>();
        public ModelTechnicalMetadataDto TechnicalMetadata { get; init; } = new();
        public int? ActiveVersionId { get; init; }
        public string? ThumbnailUrl { get; init; }
        public string? PngThumbnailUrl { get; init; }
        public ICollection<FileDto> Files { get; init; } = new List<FileDto>();
        public ICollection<PackSummaryDto> Packs { get; init; } = new List<PackSummaryDto>();
        public ICollection<ProjectSummaryDto> Projects { get; init; } = new List<ProjectSummaryDto>();
        public ICollection<TextureSetSummaryDto> TextureSets { get; init; } = new List<TextureSetSummaryDto>();
    }

    public record FileDto
    {
        public int Id { get; init; }
        public string OriginalFileName { get; init; } = string.Empty;
        public string MimeType { get; init; } = string.Empty;
        public required Domain.ValueObjects.FileType FileType { get; init; }
        public bool IsRenderable { get; init; }
        public long SizeBytes { get; init; }
    }

    public record PackSummaryDto
    {
        public int Id { get; init; }
        public string Name { get; init; } = string.Empty;
    }

    public record ProjectSummaryDto
    {
        public int Id { get; init; }
        public string Name { get; init; } = string.Empty;
    }

    public record TextureSetSummaryDto
    {
        public int Id { get; init; }
        public string Name { get; init; } = string.Empty;
    }
}