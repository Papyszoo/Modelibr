using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using SharedKernel;

namespace Application.Vfx;

/// <summary>Re-queues the animated thumbnail of one effect.</summary>
public record RegenerateVfxThumbnailCommand(int VfxId) : ICommand;

/// <summary>
/// Re-queues the thumbnail of every effect - and only effects. This is how effects that
/// predate thumbnails get one, without involving the model, texture set or any other
/// asset type's regeneration.
/// </summary>
public record RegenerateAllVfxThumbnailsCommand : ICommand<RegenerateAllVfxThumbnailsResponse>;

public record RegenerateAllVfxThumbnailsResponse(int EnqueuedCount);

internal sealed class RegenerateVfxThumbnailCommandHandler : ICommandHandler<RegenerateVfxThumbnailCommand>
{
    private readonly IVfxRepository _vfx;
    private readonly IThumbnailQueue _queue;

    public RegenerateVfxThumbnailCommandHandler(IVfxRepository vfx, IThumbnailQueue queue)
    {
        _vfx = vfx;
        _queue = queue;
    }

    public async Task<Result> Handle(RegenerateVfxThumbnailCommand command, CancellationToken cancellationToken)
    {
        var vfx = await _vfx.GetByIdAsync(command.VfxId, cancellationToken);
        if (vfx is null)
            return Result.Failure(new Error("VfxNotFound", $"Vfx with ID {command.VfxId} was not found."));

        await _queue.EnqueueVfxThumbnailAsync(vfx.Id, forceRegenerate: true, cancellationToken: cancellationToken);
        return Result.Success();
    }
}

internal sealed class RegenerateAllVfxThumbnailsCommandHandler
    : ICommandHandler<RegenerateAllVfxThumbnailsCommand, RegenerateAllVfxThumbnailsResponse>
{
    private readonly IVfxRepository _vfx;
    private readonly IThumbnailQueue _queue;

    public RegenerateAllVfxThumbnailsCommandHandler(IVfxRepository vfx, IThumbnailQueue queue)
    {
        _vfx = vfx;
        _queue = queue;
    }

    public async Task<Result<RegenerateAllVfxThumbnailsResponse>> Handle(
        RegenerateAllVfxThumbnailsCommand command,
        CancellationToken cancellationToken)
    {
        var effects = await _vfx.GetAllAsync(cancellationToken);
        var enqueued = 0;

        foreach (var vfx in effects)
        {
            await _queue.EnqueueVfxThumbnailAsync(vfx.Id, forceRegenerate: true, cancellationToken: cancellationToken);
            enqueued++;
        }

        return Result.Success(new RegenerateAllVfxThumbnailsResponse(enqueued));
    }
}
