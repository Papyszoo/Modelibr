using Application.Abstractions.Services;
using Microsoft.Extensions.Logging;

namespace Application.Vfx;

internal static class VfxThumbnails
{
    /// <summary>
    /// Queues the animated thumbnail render for an effect. Best effort: the effect is
    /// already saved, and a queue hiccup must not turn a successful save into an error.
    /// </summary>
    public static async Task TryEnqueueAsync(
        IThumbnailQueue queue,
        ILogger logger,
        int vfxId,
        CancellationToken cancellationToken)
    {
        try
        {
            await queue.EnqueueVfxThumbnailAsync(vfxId, forceRegenerate: true, cancellationToken: cancellationToken);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(ex, "Failed to enqueue the thumbnail job for vfx {VfxId}", vfxId);
        }
    }
}
