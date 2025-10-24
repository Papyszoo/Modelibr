using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.Models;

internal class GetModelVersionQueryHandler : IQueryHandler<GetModelVersionQuery, GetModelVersionResponse>
{
    private readonly IModelVersionRepository _versionRepository;

    public GetModelVersionQueryHandler(IModelVersionRepository versionRepository)
    {
        _versionRepository = versionRepository;
    }

    public async Task<Result<GetModelVersionResponse>> Handle(
        GetModelVersionQuery query,
        CancellationToken cancellationToken)
    {
        var version = await _versionRepository.GetByIdAsync(query.VersionId, cancellationToken);

        if (version == null)
        {
            return Result.Failure<GetModelVersionResponse>(
                new Error("VersionNotFound", $"Model version with ID {query.VersionId} was not found."));
        }

        var dto = new ModelVersionDto
        {
            Id = version.Id,
            ModelId = version.ModelId,
            VersionNumber = version.VersionNumber,
            Description = version.Description,
            CreatedAt = version.CreatedAt,
            Files = version.Files.Select(f => new VersionFileDto
            {
                Id = f.Id,
                OriginalFileName = f.OriginalFileName,
                MimeType = f.MimeType,
                FileType = f.FileType.Value,
                SizeBytes = f.SizeBytes,
                IsRenderable = f.FileType.IsRenderable
            }).ToList()
        };

        return Result.Success(new GetModelVersionResponse(dto));
    }
}

public record GetModelVersionQuery(int VersionId) : IQuery<GetModelVersionResponse>;

public record GetModelVersionResponse(ModelVersionDto Version);
