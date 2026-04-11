using Infrastructure.Services;
using Xunit;

namespace Infrastructure.Tests.Services;

public class EnvironmentMapStoragePathResolverTests
{
    [Fact]
    public void ResolveFullPath_WhenStoredPathIsRelative_ReturnsPathUnderUploadRoot()
    {
        var root = Path.Combine("var", "lib", "modelibr", "uploads");

        var result = EnvironmentMapStoragePathResolver.ResolveFullPath(root, "ab/cd/hashfile");

        Assert.Equal(Path.Combine(Path.GetFullPath(root), "ab", "cd", "hashfile"), result);
    }

    [Fact]
    public void ResolveFullPath_WhenStoredPathUsesLegacyUploadsPrefix_StripsUploadsSegment()
    {
        var root = Path.Combine("var", "lib", "modelibr", "uploads");

        var result = EnvironmentMapStoragePathResolver.ResolveFullPath(root, "/uploads/ab/cd/hashfile");

        Assert.Equal(Path.Combine(Path.GetFullPath(root), "ab", "cd", "hashfile"), result);
    }

    [Fact]
    public void ResolveFullPath_WhenStoredPathIsAlreadyUnderUploadRoot_ReturnsAbsolutePath()
    {
        var root = Path.Combine("var", "lib", "modelibr", "uploads");
        var absolutePath = Path.Combine(Path.GetFullPath(root), "ab", "cd", "hashfile");

        var result = EnvironmentMapStoragePathResolver.ResolveFullPath(root, absolutePath);

        Assert.Equal(absolutePath, result);
    }
}
