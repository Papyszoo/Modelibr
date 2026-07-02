using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.TextureSets;

internal sealed class GetTextureSetTagsQueryHandler : IQueryHandler<GetTextureSetTagsQuery, GetTextureSetTagsResponse>
{
    private readonly ITextureSetRepository _textureSetRepository;

    public GetTextureSetTagsQueryHandler(ITextureSetRepository textureSetRepository)
    {
        _textureSetRepository = textureSetRepository;
    }

    public async Task<Result<GetTextureSetTagsResponse>> Handle(GetTextureSetTagsQuery query, CancellationToken cancellationToken)
    {
        var names = await _textureSetRepository.GetAssignedTagNamesAsync(cancellationToken);
        var items = names
            .Select(name => new TextureSetTagDto { Name = name })
            .ToArray();

        return Result.Success(new GetTextureSetTagsResponse(items));
    }
}

public record GetTextureSetTagsQuery : IQuery<GetTextureSetTagsResponse>;

public record GetTextureSetTagsResponse(IReadOnlyList<TextureSetTagDto> Tags);

public record TextureSetTagDto
{
    public string Name { get; init; } = string.Empty;
}
