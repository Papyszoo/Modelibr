using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.Models
{
    internal class GetModelByIdQueryHandler : IQueryHandler<GetModelByIdQuery, GetModelByIdQueryResponse>
    {
        private readonly IModelRepository _modelRepository;

        public GetModelByIdQueryHandler(IModelRepository modelRepository)
        {
            _modelRepository = modelRepository;
        }

        public async Task<Result<GetModelByIdQueryResponse>> Handle(GetModelByIdQuery query, CancellationToken cancellationToken)
        {
            var model = await _modelRepository.GetByIdAsync(query.ModelId, cancellationToken);
            
            if (model == null)
            {
                return Result.Failure<GetModelByIdQueryResponse>(
                    new Error("ModelNotFound", $"Model with ID {query.ModelId} was not found."));
            }

            var modelDto = new ModelDto
            {
                Id = model.Id,
                Name = model.Name,
                CreatedAt = model.CreatedAt,
                UpdatedAt = model.UpdatedAt,
                Tags = model.Tags,
                Description = model.Description,
                Files = model.Files.Select(f => new FileDto
                {
                    Id = f.Id,
                    OriginalFileName = f.OriginalFileName,
                    MimeType = f.MimeType,
                    FileType = f.FileType,
                    IsRenderable = f.FileType.IsRenderable,
                    SizeBytes = f.SizeBytes
                }).ToList()
            };

            return Result.Success(new GetModelByIdQueryResponse(modelDto));
        }
    }

    public record GetModelByIdQuery(int ModelId) : IQuery<GetModelByIdQueryResponse>;
    
    public record GetModelByIdQueryResponse(ModelDto Model);
}