using Application.Abstractions.Storage;
using Moq;
using Xunit;

namespace Application.Tests.Thumbnails;

/// <summary>
/// Stored thumbnail paths are relative to the uploads root, so the served location
/// follows whatever root the app is running with. That is the whole point of the
/// change: the same database serves correctly after the uploads root moves. A
/// stored value that would resolve outside the root - an absolute path from a
/// different machine, or one climbing out with .. - must be refused so a read site
/// cannot be turned into an arbitrary-file read.
/// </summary>
public class UploadPathResolverTests
{
    private const string Root = "/var/lib/modelibr/uploads";

    private static IUploadPathProvider Provider()
    {
        var provider = new Mock<IUploadPathProvider>();
        provider.SetupGet(p => p.UploadRootPath).Returns(Root);
        return provider.Object;
    }

    [Fact]
    public void Resolve_RelativePath_FollowsTheCurrentUploadsRoot()
    {
        var provider = new Mock<IUploadPathProvider>();
        provider.SetupGet(p => p.UploadRootPath).Returns(Root);
        Assert.Equal(
            Path.Combine(Root, "ab/cd/hash"),
            provider.Object.Resolve("ab/cd/hash"));

        // Same stored value, different root - the portability guarantee.
        provider.SetupGet(p => p.UploadRootPath).Returns("/home/me/modelibr/data/uploads");
        Assert.Equal(
            Path.Combine("/home/me/modelibr/data/uploads", "ab/cd/hash"),
            provider.Object.Resolve("ab/cd/hash"));
    }

    [Fact]
    public void Resolve_AbsolutePathInsideTheRoot_IsReturned()
    {
        var absolute = Path.Combine(Root, "ab/cd/hash");

        Assert.Equal(absolute, Provider().Resolve(absolute));
    }

    [Fact]
    public void Resolve_AbsolutePathOutsideTheRoot_IsRefused()
    {
        Assert.Throws<InvalidOperationException>(
            () => Provider().Resolve("/legacy/absolute/path.png"));
    }

    [Fact]
    public void Resolve_RelativePathClimbingOutOfTheRoot_IsRefused()
    {
        Assert.Throws<InvalidOperationException>(
            () => Provider().Resolve("../../etc/passwd"));
    }
}
