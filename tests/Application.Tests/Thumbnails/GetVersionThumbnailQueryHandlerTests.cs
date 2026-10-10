using Application.Abstractions.Repositories;
using Application.Thumbnails;
using Domain.Models;
using Domain.ValueObjects;
using Moq;
using Xunit;

namespace Application.Tests.Thumbnails;

/// <summary>
/// The version-thumbnail query returns the stored path exactly as persisted
/// (relative to the uploads root), the same contract as the model-status query.
/// Read sites that actually open the file rebase it against the current root;
/// returning an absolute path here made the serving endpoints resolve an
/// already-resolved value.
/// </summary>
public class GetVersionThumbnailQueryHandlerTests
{
    private static readonly DateTime Now = new(2026, 10, 10, 12, 0, 0, DateTimeKind.Utc);

    private static GetVersionThumbnailQueryHandler NewHandler(Thumbnail? thumbnail)
    {
        var version = Model.Create("Model", Now).CreateVersion("v1", Now).WithId(10);

        var versions = new Mock<IModelVersionRepository>();
        versions
            .Setup(r => r.GetByIdAsync(10, It.IsAny<CancellationToken>()))
            .ReturnsAsync(version);

        var thumbnails = new Mock<IThumbnailRepository>();
        thumbnails
            .Setup(r => r.GetByModelVersionIdAsync(10, It.IsAny<CancellationToken>()))
            .ReturnsAsync(thumbnail);

        return new GetVersionThumbnailQueryHandler(thumbnails.Object, versions.Object);
    }

    [Fact]
    public async Task Handle_ReturnsStoredRelativePathsUnrebased()
    {
        var thumbnail = Thumbnail.Create(1, 10, Now).WithId(5);
        thumbnail.MarkAsReady("ab/cd/hash", "ab/cd/png", 128, 256, 256, Now);

        var result = await NewHandler(thumbnail)
            .Handle(new GetVersionThumbnailQuery(10), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(ThumbnailStatus.Ready, result.Value.Status);
        Assert.Equal("ab/cd/hash", result.Value.ThumbnailPath);
        Assert.Equal("ab/cd/png", result.Value.PngThumbnailPath);
    }
}
