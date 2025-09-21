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
            
            var modelDtos = models.Select(m => new ModelDto
            {
                Id = m.Id,
                Name = m.Name,
                CreatedAt = m.CreatedAt,
                UpdatedAt = m.UpdatedAt,
                Files = m.Files.Select(f => new FileDto
                {
                    Id = f.Id,
                    OriginalFileName = f.OriginalFileName,
                    MimeType = f.MimeType,
                    FileType = f.FileType,
                    IsRenderable = f.FileType.IsRenderable,
                    SizeBytes = f.SizeBytes
                }).ToList()
            }).ToList();

            return Result.Success(new GetAllModelsQueryResponse(modelDtos));
        }
    }

    public record GetAllModelsQuery() : IQuery<GetAllModelsQueryResponse>;
    
    public record GetAllModelsQueryResponse(IEnumerable<ModelDto> Models);
    
    public record ModelDto
    {
        public int Id { get; init; }
        public string Name { get; init; } = string.Empty;
        public DateTime CreatedAt { get; init; }
        public DateTime UpdatedAt { get; init; }
        public ICollection<FileDto> Files { get; init; } = new List<FileDto>();
    }

    public record FileDto
    {
        public int Id { get; init; }
        public string OriginalFileName { get; init; } = string.Empty;
        public string MimeType { get; init; } = string.Empty;
        public FileType FileType { get; init; }
        public bool IsRenderable { get; init; }
        public long SizeBytes { get; init; }
    }
}