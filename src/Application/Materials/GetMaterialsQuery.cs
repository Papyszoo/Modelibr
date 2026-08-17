using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.Materials;

public record GetAllMaterialsQuery(
    IReadOnlyCollection<int>? CategoryIds = null,
    string? SearchName = null) : IQuery<GetAllMaterialsResponse>;

public record GetAllMaterialsResponse(IReadOnlyList<MaterialDto> Materials);

internal sealed class GetAllMaterialsQueryHandler : IQueryHandler<GetAllMaterialsQuery, GetAllMaterialsResponse>
{
    private readonly IMaterialRepository _materialRepository;

    public GetAllMaterialsQueryHandler(IMaterialRepository materialRepository)
    {
        _materialRepository = materialRepository;
    }

    public async Task<Result<GetAllMaterialsResponse>> Handle(
        GetAllMaterialsQuery query,
        CancellationToken cancellationToken)
    {
        var materials = await _materialRepository.GetAllAsync(cancellationToken);
        IEnumerable<Domain.Models.Material> filtered = materials;

        if (query.CategoryIds is { Count: > 0 })
            filtered = filtered.Where(m => m.CategoryId.HasValue && query.CategoryIds.Contains(m.CategoryId.Value));

        if (!string.IsNullOrWhiteSpace(query.SearchName))
        {
            var search = query.SearchName.Trim();
            filtered = filtered.Where(m => m.Name.Contains(search, StringComparison.OrdinalIgnoreCase));
        }

        return Result.Success(new GetAllMaterialsResponse(filtered.Select(MaterialDto.From).ToList()));
    }
}

public record GetMaterialByIdQuery(int Id) : IQuery<MaterialDto>;

internal sealed class GetMaterialByIdQueryHandler : IQueryHandler<GetMaterialByIdQuery, MaterialDto>
{
    private readonly IMaterialRepository _materialRepository;

    public GetMaterialByIdQueryHandler(IMaterialRepository materialRepository)
    {
        _materialRepository = materialRepository;
    }

    public async Task<Result<MaterialDto>> Handle(GetMaterialByIdQuery query, CancellationToken cancellationToken)
    {
        var material = await _materialRepository.GetByIdAsync(query.Id, cancellationToken);

        return material is null
            ? Result.Failure<MaterialDto>(new Error("MaterialNotFound", $"Material with ID {query.Id} was not found."))
            : Result.Success(MaterialDto.From(material));
    }
}
