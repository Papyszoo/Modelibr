using Application.Abstractions.Services;
using Infrastructure.Services;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace Infrastructure.Tests.Services;

/// <summary>
/// Covers BlendFileGenerationQueue — the bounded Channel + BackgroundService that
/// (re)generates generated-{name}.blend in the background after a renderable file is
/// attached to a version, or the cache is invalidated. See IBlendFileGenerationQueue.
/// </summary>
public class BlendFileGenerationQueueTests
{
    [Fact]
    public async Task Enqueue_WhenBlenderAvailable_TriggersBackgroundGenerationExactlyOnce()
    {
        var mockGenerator = new Mock<IBlendFileGenerator>();
        mockGenerator.Setup(g => g.IsAvailable).Returns(true);

        var signal = new TaskCompletionSource();
        mockGenerator
            .Setup(g => g.GetOrGenerateAsync(1, 2, It.IsAny<CancellationToken>()))
            .Returns(() =>
            {
                signal.TrySetResult();
                return Task.FromResult<GeneratedBlendInfo?>(new GeneratedBlendInfo("/tmp/x.blend", 10, DateTime.UtcNow));
            });

        var queue = new BlendFileGenerationQueue(mockGenerator.Object, NullLogger<BlendFileGenerationQueue>.Instance);

        await queue.StartAsync(CancellationToken.None);
        try
        {
            queue.Enqueue(1, 2);

            var completed = await Task.WhenAny(signal.Task, Task.Delay(TimeSpan.FromSeconds(5)));
            Assert.Same(signal.Task, completed);
        }
        finally
        {
            await queue.StopAsync(CancellationToken.None);
        }

        mockGenerator.Verify(g => g.GetOrGenerateAsync(1, 2, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Enqueue_WhenBlenderUnavailable_NeverCallsGenerator()
    {
        var mockGenerator = new Mock<IBlendFileGenerator>();
        mockGenerator.Setup(g => g.IsAvailable).Returns(false);

        var queue = new BlendFileGenerationQueue(mockGenerator.Object, NullLogger<BlendFileGenerationQueue>.Instance);

        await queue.StartAsync(CancellationToken.None);
        try
        {
            // Must not throw, must not block the caller.
            queue.Enqueue(1, 2);

            // Give the (empty) channel a moment — there's nothing to observe finishing,
            // so this just proves Enqueue returned immediately without queuing anything.
            await Task.Delay(TimeSpan.FromMilliseconds(200));
        }
        finally
        {
            await queue.StopAsync(CancellationToken.None);
        }

        mockGenerator.Verify(g => g.GetOrGenerateAsync(It.IsAny<int>(), It.IsAny<int>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public void Enqueue_NeverThrowsEvenWithoutTheBackgroundServiceRunning()
    {
        // Enqueue must never block or fail the caller (a request handler) — even if the
        // BackgroundService hasn't been started yet (e.g. host startup ordering).
        var mockGenerator = new Mock<IBlendFileGenerator>();
        mockGenerator.Setup(g => g.IsAvailable).Returns(true);

        var queue = new BlendFileGenerationQueue(mockGenerator.Object, NullLogger<BlendFileGenerationQueue>.Instance);

        var exception = Record.Exception(() => queue.Enqueue(1, 2));

        Assert.Null(exception);
    }
}
