using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.Models;

internal sealed class GetAllModelTagsQueryHandler : IQueryHandler<GetAllModelTagsQuery, GetAllModelTagsResponse>
{
    private readonly IModelTagRepository _modelTagRepository;

    public GetAllModelTagsQueryHandler(IModelTagRepository modelTagRepository)
    {
        _modelTagRepository = modelTagRepository;
    }

    public async Task<Result<GetAllModelTagsResponse>> Handle(GetAllModelTagsQuery query, CancellationToken cancellationToken)
    {
        var tags = await _modelTagRepository.GetAllAsync(cancellationToken);
        var items = tags
            .OrderBy(tag => tag.Name)
            .Select(tag => new ModelTagDto
            {
                Name = tag.Name
            })
            .ToArray();

        return Result.Success(new GetAllModelTagsResponse(items));
    }
}

public record GetAllModelTagsQuery : IQuery<GetAllModelTagsResponse>;

public record GetAllModelTagsResponse(IReadOnlyList<ModelTagDto> Tags);

public record ModelTagDto
{
    public string Name { get; init; } = string.Empty;
}