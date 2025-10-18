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
            
            var modelDtos = models.Select(m => new ModelDto
            {
                Id = m.Id,
                Name = m.Name,
                CreatedAt = m.CreatedAt,
                UpdatedAt = m.UpdatedAt,
                Tags = m.Tags,
                Description = m.Description,
                DefaultTextureSetId = m.DefaultTextureSetId,
                Files = m.Files.Select(f => new FileDto
                {
                    Id = f.Id,
                    OriginalFileName = f.OriginalFileName,
                    MimeType = f.MimeType,
                    FileType = f.FileType,
                    IsRenderable = f.FileType.IsRenderable,
                    SizeBytes = f.SizeBytes
                }).ToList(),
                Packs = m.Packs.Select(p => new PackSummaryDto
                {
                    Id = p.Id,
                    Name = p.Name
                }).ToList(),
                TextureSets = m.TextureSets.Select(ts => new TextureSetSummaryDto
                {
                    Id = ts.Id,
                    Name = ts.Name
                }).ToList()
            }).ToList();

            return Result.Success(new GetAllModelsQueryResponse(modelDtos));
        }
    }

    public record GetAllModelsQuery(int? PackId = null) : IQuery<GetAllModelsQueryResponse>;
    
    public record GetAllModelsQueryResponse(IEnumerable<ModelDto> Models);
    
    public record ModelDto
    {
        public int Id { get; init; }
        public string Name { get; init; } = string.Empty;
        public DateTime CreatedAt { get; init; }
        public DateTime UpdatedAt { get; init; }
        public string? Tags { get; init; }
        public string? Description { get; init; }
        public int? DefaultTextureSetId { get; init; }
        public ICollection<FileDto> Files { get; init; } = new List<FileDto>();
        public ICollection<PackSummaryDto> Packs { get; init; } = new List<PackSummaryDto>();
        public ICollection<TextureSetSummaryDto> TextureSets { get; init; } = new List<TextureSetSummaryDto>();
    }

    public record FileDto
    {
        public int Id { get; init; }
        public string OriginalFileName { get; init; } = string.Empty;
        public string MimeType { get; init; } = string.Empty;
        public required FileType FileType { get; init; }
        public bool IsRenderable { get; init; }
        public long SizeBytes { get; init; }
    }

    public record PackSummaryDto
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