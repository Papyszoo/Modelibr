using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.Packs;

internal class GetPackByIdQueryHandler : IQueryHandler<GetPackByIdQuery, PackDto>
{
    private readonly IPackRepository _packRepository;

    public GetPackByIdQueryHandler(IPackRepository packRepository)
    {
        _packRepository = packRepository;
    }

    public async Task<Result<PackDto>> Handle(GetPackByIdQuery query, CancellationToken cancellationToken)
    {
        var pack = await _packRepository.GetByIdAsync(query.Id, cancellationToken);

        if (pack == null)
        {
            return Result.Failure<PackDto>(
                new Error("PackNotFound", $"Pack with ID {query.Id} was not found."));
        }

        var packDto = new PackDto
        {
            Id = pack.Id,
            Name = pack.Name,
            Description = pack.Description,
            CreatedAt = pack.CreatedAt,
            UpdatedAt = pack.UpdatedAt,
            ModelCount = pack.ModelCount,
            TextureSetCount = pack.TextureSetCount,
            IsEmpty = pack.IsEmpty,
            Models = pack.Models.Select(m => new PackModelDto
            {
                Id = m.Id,
                Name = m.Name
            }).ToList(),
            TextureSets = pack.TextureSets.Select(ts => new PackTextureSetDto
            {
                Id = ts.Id,
                Name = ts.Name
            }).ToList()
        };

        return Result.Success(packDto);
    }
}

public record GetPackByIdQuery(int Id) : IQuery<PackDto>;
