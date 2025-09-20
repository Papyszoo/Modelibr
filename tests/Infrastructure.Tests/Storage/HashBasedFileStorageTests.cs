using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Domain.Files;
using Infrastructure.Storage;
using Infrastructure.Tests.Fakes;
using Xunit;

namespace Infrastructure.Tests.Storage;

public class HashBasedFileStorageTests
{
    private static string CreateTempRoot()
    {
        var p = Path.Combine(Path.GetTempPath(), "modelibr_tests", Path.GetRandomFileName());
        Directory.CreateDirectory(p);
        return p;
    }

    [Fact]
    public async Task Saves_File_Into_Hash_Sharded_Path()
    {
        var root = CreateTempRoot();
        var provider = new FakeUploadPathProvider(root);
        var storage = new HashBasedFileStorage(provider);

        var data = new byte[] { 1, 2, 3, 4, 5 };
        var upload = new FakeFileUpload("cube.obj", data);

        var result = await storage.SaveAsync(upload, FileType.Model3D, CancellationToken.None);

        // relative path format: aa/bb/fullhash
        var parts = result.RelativePath.Split('/');
        Assert.Equal(3, parts.Length);
        Assert.Equal(result.StoredName, parts[2]);
        Assert.True(File.Exists(Path.Combine(root, result.RelativePath)));

        var onDisk = await File.ReadAllBytesAsync(Path.Combine(root, result.RelativePath));
        Assert.Equal(data, onDisk);
    }

    [Fact]
    public async Task Deduplicates_Same_Content()
    {
        var root = CreateTempRoot();
        var provider = new FakeUploadPathProvider(root);
        var storage = new HashBasedFileStorage(provider);

        var data = Enumerable.Range(0, 1024).Select(i => (byte)(i % 256)).ToArray();

        var u1 = new FakeFileUpload("a.bin", data);
        var u2 = new FakeFileUpload("b.bin", data);

        var r1 = await storage.SaveAsync(u1, FileType.Texture, CancellationToken.None);
        var r2 = await storage.SaveAsync(u2, FileType.Project, CancellationToken.None);

        Assert.Equal(r1.Sha256, r2.Sha256);
        Assert.Equal(r1.StoredName, r2.StoredName);
        Assert.Equal(r1.RelativePath, r2.RelativePath);

        // Only one physical file
        var fullPath = Path.Combine(root, r1.RelativePath);
        Assert.True(File.Exists(fullPath));

        // temp directory cleaned (no leftover temp files)
        var tmpDir = Path.Combine(root, "tmp");
        if (Directory.Exists(tmpDir))
        {
            Assert.Empty(Directory.EnumerateFiles(tmpDir));
        }
    }

    [Fact]
    public async Task Concurrent_Saves_Do_Not_Corrupt()
    {
        var root = CreateTempRoot();
        var provider = new FakeUploadPathProvider(root);
        var storage = new HashBasedFileStorage(provider);

        var data = new byte[32 * 1024];
        new System.Random(42).NextBytes(data);

        var tasks = Enumerable.Range(0, 10)
            .Select(i => storage.SaveAsync(new FakeFileUpload($"f{i}.dat", data), FileType.Model3D, CancellationToken.None))
            .ToArray();

        var results = await Task.WhenAll(tasks);
        Assert.True(results.All(r => r.Sha256 == results[0].Sha256));

        var uniqueRelative = results.Select(r => r.RelativePath).Distinct().Single();
        Assert.True(File.Exists(Path.Combine(root, uniqueRelative)));
    }
}