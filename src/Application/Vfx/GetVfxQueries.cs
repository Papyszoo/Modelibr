using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Abstractions.Storage;
using SharedKernel;

namespace Application.Vfx;

/// <summary>Every effect, browsable without opening a definition.</summary>
public sealed record GetVfxListQuery : IQuery<IReadOnlyList<VfxSummaryDto>>;

internal sealed class GetVfxListQueryHandler : IQueryHandler<GetVfxListQuery, IReadOnlyList<VfxSummaryDto>>
{
    private readonly IVfxRepository _vfx;

    public GetVfxListQueryHandler(IVfxRepository vfx)
    {
        _vfx = vfx;
    }

    public async Task<Result<IReadOnlyList<VfxSummaryDto>>> Handle(
        GetVfxListQuery query,
        CancellationToken cancellationToken)
    {
        var effects = await _vfx.GetAllAsync(cancellationToken);

        return Result.Success<IReadOnlyList<VfxSummaryDto>>(
            effects.Select(VfxSummaryDto.From).ToList());
    }
}

/// <summary>One effect in full, its definition parsed as a JSON object.</summary>
public sealed record GetVfxQuery(int Id) : IQuery<VfxDetailDto>;

internal sealed class GetVfxQueryHandler : IQueryHandler<GetVfxQuery, VfxDetailDto>
{
    private readonly IVfxRepository _vfx;

    public GetVfxQueryHandler(IVfxRepository vfx)
    {
        _vfx = vfx;
    }

    public async Task<Result<VfxDetailDto>> Handle(GetVfxQuery query, CancellationToken cancellationToken)
    {
        var vfx = await _vfx.GetByIdAsync(query.Id, cancellationToken);

        return vfx is null
            ? Result.Failure<VfxDetailDto>(new Error("VfxNotFound", $"Vfx with ID {query.Id} was not found."))
            : Result.Success(VfxDetailDto.From(vfx));
    }
}

/// <summary>The stored path of an effect's thumbnail file, for the endpoint that serves it.</summary>
public sealed record GetVfxThumbnailQuery(int Id) : IQuery<string>;

internal sealed class GetVfxThumbnailQueryHandler : IQueryHandler<GetVfxThumbnailQuery, string>
{
    private readonly IVfxRepository _vfx;
    private readonly IUploadPathProvider _paths;

    public GetVfxThumbnailQueryHandler(IVfxRepository vfx, IUploadPathProvider paths)
    {
        _vfx = vfx;
        _paths = paths;
    }

    public async Task<Result<string>> Handle(GetVfxThumbnailQuery query, CancellationToken cancellationToken)
    {
        var vfx = await _vfx.GetByIdAsync(query.Id, cancellationToken);

        return string.IsNullOrEmpty(vfx?.ThumbnailPath)
            ? Result.Failure<string>(new Error("VfxThumbnailNotFound", $"Vfx {query.Id} has no thumbnail."))
            // Stored relative to the uploads root; the serving endpoint needs the real path.
            : Result.Success(_paths.Resolve(vfx.ThumbnailPath));
    }
}
