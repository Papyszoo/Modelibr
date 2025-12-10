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
            
            var modelListDtos = models.Select(m => new ModelListDto
            {
                Id = m.Id,
                Name = m.Name,
                CreatedAt = m.CreatedAt,
                UpdatedAt = m.UpdatedAt,
                Tags = m.Tags,
                Description = m.Description,
                ActiveVersionId = m.ActiveVersionId,
                ThumbnailUrl = m.ActiveVersion?.Thumbnail?.Status == ThumbnailStatus.Ready 
                    ? $"/model-versions/{m.ActiveVersion.Id}/thumbnail/file" 
                    : null,
                PngThumbnailUrl = m.ActiveVersion?.Thumbnail?.Status == ThumbnailStatus.Ready && !string.IsNullOrEmpty(m.ActiveVersion.Thumbnail.PngThumbnailPath)
                    ? $"/model-versions/{m.ActiveVersion.Id}/thumbnail/png-file" 
                    : null
            }).ToList();

            return Result.Success(new GetAllModelsQueryResponse(modelListDtos));
        }
    }

    public record GetAllModelsQuery(int? PackId = null, int? ProjectId = null) : IQuery<GetAllModelsQueryResponse>;
    
    public record GetAllModelsQueryResponse(IEnumerable<ModelListDto> Models);
    
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
        public int? ActiveVersionId { get; init; }
        public string? ThumbnailUrl { get; init; }
        public string? PngThumbnailUrl { get; init; }
    }
}