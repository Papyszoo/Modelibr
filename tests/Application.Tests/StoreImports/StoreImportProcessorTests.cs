using System.Security.Cryptography;
using Application.Abstractions;
using Application.Abstractions.Files;
using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Application.StoreImports;
using Domain.Models;
using Domain.Services;
using Domain.ValueObjects;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace Application.Tests.StoreImports;

public class StoreImportProcessorTests
{
    private const string StoreUrl = "https://store.example.com";
    private const string AssetId = "asset-1";
    private const string Token = "secret-token-value";
    private const int JobId = 42;
    private const int NewPackId = 7;

    // ---- manifest → handler mapping per item type ----

    [Fact]
    public async Task Process_ModelItem_CreatesModelAddsExtraFilesTagsAndAddsToPack()
    {
        var h = new Harness();
        var mesh = h.MakeFile("u/mesh", RandomBytes(), "Mesh", "chair.glb");
        var extra = h.MakeFile("u/extra", RandomBytes(), "Image", "chair_albedo.png");
        h.SetManifest(Item("Model", "Chair", mesh, extra), tags: new[] { "furniture" });
        h.Sink.Setup(s => s.CreateModelAsync(It.IsAny<IFileUpload>(), "Chair", It.IsAny<CancellationToken>())).ReturnsAsync(101);

        await h.Run();

        h.Sink.Verify(s => s.CreateModelAsync(It.IsAny<IFileUpload>(), "Chair", It.IsAny<CancellationToken>()), Times.Once);
        h.Sink.Verify(s => s.AddFileToModelAsync(101, It.IsAny<IFileUpload>(), It.IsAny<CancellationToken>()), Times.Once);
        h.Sink.Verify(s => s.SetModelTagsAsync(101, It.Is<IReadOnlyCollection<string>>(t => t.Contains("furniture")), "Chair", It.IsAny<CancellationToken>()), Times.Once);
        h.Sink.Verify(s => s.AddModelToPackAsync(NewPackId, 101, It.IsAny<CancellationToken>()), Times.Once);
        Assert.Equal(1, h.Job.ItemsCreated);
        Assert.Equal(0, h.Job.ItemsFailed);
    }

    [Fact]
    public async Task Process_TextureSetItem_MapsFirstTypeAndPerTextureChannel()
    {
        var h = new Harness();
        var albedo = h.MakeFile("u/albedo", RandomBytes(), "Texture:Albedo", "brick_albedo.png");
        var rough = h.MakeFile("u/rough", RandomBytes(), "Texture:Roughness:G", "brick_orm.png");
        h.SetManifest(Item("TextureSet", "Bricks", albedo, rough));
        h.Sink.Setup(s => s.CreateTextureSetAsync(It.IsAny<IFileUpload>(), "Bricks", TextureType.Albedo, It.IsAny<CancellationToken>())).ReturnsAsync(201);
        h.Sink.Setup(s => s.UploadTextureFileAsync(201, It.IsAny<IFileUpload>(), It.IsAny<CancellationToken>())).ReturnsAsync(301);

        await h.Run();

        h.Sink.Verify(s => s.CreateTextureSetAsync(It.IsAny<IFileUpload>(), "Bricks", TextureType.Albedo, It.IsAny<CancellationToken>()), Times.Once);
        h.Sink.Verify(s => s.AddTextureAsync(201, 301, TextureType.Roughness, TextureChannel.G, It.IsAny<CancellationToken>()), Times.Once);
        h.Sink.Verify(s => s.AddTextureSetToPackAsync(NewPackId, 201, It.IsAny<CancellationToken>()), Times.Once);
        Assert.Equal(1, h.Job.ItemsCreated);
    }

    [Fact]
    public async Task Process_TextureSet_OpacityRole_MapsFirstTypeToAlpha()
    {
        var h = new Harness();
        var opacity = h.MakeFile("u/op", RandomBytes(), "Texture:Opacity", "glass_opacity.png");
        h.SetManifest(Item("TextureSet", "Glass", opacity));
        h.Sink.Setup(s => s.CreateTextureSetAsync(It.IsAny<IFileUpload>(), "Glass", TextureType.Alpha, It.IsAny<CancellationToken>())).ReturnsAsync(202);

        await h.Run();

        h.Sink.Verify(s => s.CreateTextureSetAsync(It.IsAny<IFileUpload>(), "Glass", TextureType.Alpha, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Process_SpriteItem_CreatesSpriteAndAddsToPack()
    {
        var h = new Harness();
        var file = h.MakeFile("u/sprite", RandomBytes(), "Image", "hero.png");
        h.SetManifest(Item("Sprite", "Hero", file));
        h.Sink.Setup(s => s.CreateSpriteAsync(It.IsAny<IFileUpload>(), "Hero", It.IsAny<CancellationToken>())).ReturnsAsync(501);

        await h.Run();

        h.Sink.Verify(s => s.CreateSpriteAsync(It.IsAny<IFileUpload>(), "Hero", It.IsAny<CancellationToken>()), Times.Once);
        h.Sink.Verify(s => s.AddSpriteToPackAsync(NewPackId, 501, It.IsAny<CancellationToken>()), Times.Once);
        Assert.Equal(1, h.Job.ItemsCreated);
    }

    [Fact]
    public async Task Process_SoundItem_CreatesSoundAndAddsToPack()
    {
        var h = new Harness();
        var file = h.MakeFile("u/sound", RandomBytes(), "Audio", "boom.wav");
        h.SetManifest(Item("Sound", "Boom", file));
        h.Sink.Setup(s => s.CreateSoundAsync(It.IsAny<IFileUpload>(), "Boom", It.IsAny<CancellationToken>())).ReturnsAsync(401);

        await h.Run();

        h.Sink.Verify(s => s.CreateSoundAsync(It.IsAny<IFileUpload>(), "Boom", It.IsAny<CancellationToken>()), Times.Once);
        h.Sink.Verify(s => s.AddSoundToPackAsync(NewPackId, 401, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Process_EnvironmentMapItem_CreatesEnvMapAndAddsToPack()
    {
        var h = new Harness();
        var file = h.MakeFile("u/env", RandomBytes(), "Panorama", "sky.hdr");
        h.SetManifest(Item("EnvironmentMap", "Sky", file));
        h.Sink.Setup(s => s.CreateEnvironmentMapAsync(It.IsAny<IFileUpload>(), "Sky", It.IsAny<CancellationToken>())).ReturnsAsync(601);

        await h.Run();

        h.Sink.Verify(s => s.CreateEnvironmentMapAsync(It.IsAny<IFileUpload>(), "Sky", It.IsAny<CancellationToken>()), Times.Once);
        h.Sink.Verify(s => s.AddEnvironmentMapToPackAsync(NewPackId, 601, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Process_OtherItem_SkippedAndReported_NoDownload()
    {
        var h = new Harness();
        var file = h.MakeFile("u/other", RandomBytes(), "Unknown", "notes.txt");
        h.SetManifest(Item("Other", "Notes", file));

        await h.Run();

        h.Client.Verify(c => c.DownloadFileAsync(It.IsAny<string>(), "u/other", It.IsAny<string>(), It.IsAny<long>(), It.IsAny<CancellationToken>()), Times.Never);
        Assert.Equal(0, h.Job.ItemsCreated);
        Assert.Equal(1, h.Job.ItemsSkipped);
        Assert.Contains("skipped-unsupported", h.Job.ResultJson);
    }

    // ---- SHA dedupe ----

    [Fact]
    public async Task Process_ModelItem_WhenFileHashExists_LinksWithoutDownloadingOrCreating()
    {
        var h = new Harness();
        var mesh = h.MakeFile("u/mesh", RandomBytes(), "Mesh", "chair.glb");
        h.SetManifest(Item("Model", "Chair", mesh));
        h.ModelRepo.Setup(r => r.GetByFileHashAsync(mesh.Sha256, It.IsAny<CancellationToken>()))
            .ReturnsAsync(Model.Create("Existing Chair", h.Now).WithId(55));

        await h.Run();

        h.Client.Verify(c => c.DownloadFileAsync(It.IsAny<string>(), "u/mesh", It.IsAny<string>(), It.IsAny<long>(), It.IsAny<CancellationToken>()), Times.Never);
        h.Sink.Verify(s => s.CreateModelAsync(It.IsAny<IFileUpload>(), It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
        h.Sink.Verify(s => s.AddModelToPackAsync(NewPackId, 55, It.IsAny<CancellationToken>()), Times.Once);
        Assert.Equal(1, h.Job.ItemsSkipped);
        Assert.Equal(0, h.Job.ItemsCreated);
        Assert.Contains("skipped-dedupe", h.Job.ResultJson);
    }

    // ---- re-run idempotency via provenance ----

    [Fact]
    public async Task Process_WhenPackAlreadyImported_ReusesPackNoSecondPack_AndGapFills()
    {
        var h = new Harness();
        var existingPack = Pack.Create("Chair Pack", null, null, null, h.Now).WithId(9);
        h.PackRepo.Setup(r => r.GetByStoreImportAsync(StoreUrl, AssetId, It.IsAny<CancellationToken>())).ReturnsAsync(existingPack);

        var mesh = h.MakeFile("u/mesh", RandomBytes(), "Mesh", "chair.glb"); // already imported
        var newSound = h.MakeFile("u/sound", RandomBytes(), "Audio", "creak.wav"); // gap to fill
        h.SetManifest(
            Item("Model", "Chair", mesh),
            Item("Sound", "Creak", newSound));
        h.ModelRepo.Setup(r => r.GetByFileHashAsync(mesh.Sha256, It.IsAny<CancellationToken>()))
            .ReturnsAsync(Model.Create("Existing Chair", h.Now).WithId(55));
        h.Sink.Setup(s => s.CreateSoundAsync(It.IsAny<IFileUpload>(), "Creak", It.IsAny<CancellationToken>())).ReturnsAsync(401);

        await h.Run();

        h.Sink.Verify(s => s.CreatePackAsync(It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()), Times.Never);
        h.Sink.Verify(s => s.RecordPackProvenanceAsync(9, StoreUrl, AssetId, 1, It.IsAny<CancellationToken>()), Times.Once);
        h.Sink.Verify(s => s.AddModelToPackAsync(9, 55, It.IsAny<CancellationToken>()), Times.Once);
        h.Sink.Verify(s => s.AddSoundToPackAsync(9, 401, It.IsAny<CancellationToken>()), Times.Once);
        Assert.Equal(9, h.Job.PackId);
        Assert.Equal(1, h.Job.ItemsCreated);
        Assert.Equal(1, h.Job.ItemsSkipped);
    }

    // ---- hash mismatch fails one item, pack continues ----

    [Fact]
    public async Task Process_WhenHashMismatch_ItemFails_PackContinues()
    {
        var h = new Harness();
        var badMesh = h.MakeFile("u/mesh", RandomBytes(), "Mesh", "chair.glb", sha256: new string('0', 64));
        var goodSound = h.MakeFile("u/sound", RandomBytes(), "Audio", "boom.wav");
        h.SetManifest(
            Item("Model", "Chair", badMesh),
            Item("Sound", "Boom", goodSound));
        h.Sink.Setup(s => s.CreateSoundAsync(It.IsAny<IFileUpload>(), "Boom", It.IsAny<CancellationToken>())).ReturnsAsync(401);

        await h.Run();

        h.Sink.Verify(s => s.CreateModelAsync(It.IsAny<IFileUpload>(), It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
        h.Sink.Verify(s => s.AddSoundToPackAsync(NewPackId, 401, It.IsAny<CancellationToken>()), Times.Once);
        Assert.Equal(1, h.Job.ItemsFailed);
        Assert.Equal(1, h.Job.ItemsCreated);
        Assert.Contains("SHA-256 mismatch", h.Job.ResultJson);
        Assert.Equal(Domain.ValueObjects.StoreImportJobStatus.CompletedWithErrors, h.Job.Status);
    }

    // ---- helpers ----

    private static StoreManifestItem Item(string type, string name, params StoreManifestFile[] files)
        => new(type, name, files, null);

    private static byte[] RandomBytes()
    {
        var bytes = new byte[32];
        Random.Shared.NextBytes(bytes);
        return bytes;
    }

    private static string Sha256Hex(byte[] bytes)
        => Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();

    private static byte[] ReadAll(IFileUpload upload)
    {
        using var stream = upload.OpenRead();
        using var ms = new MemoryStream();
        stream.CopyTo(ms);
        return ms.ToArray();
    }

    private sealed class Harness
    {
        public readonly Mock<IStoreImportClient> Client = new();
        public readonly Mock<IStoreImportSink> Sink = new();
        public readonly Mock<IStoreImportJobRepository> JobRepo = new();
        public readonly Mock<IPackRepository> PackRepo = new();
        public readonly Mock<IModelRepository> ModelRepo = new();
        public readonly Mock<ITextureSetRepository> TextureSetRepo = new();
        public readonly Mock<ISoundRepository> SoundRepo = new();
        public readonly Mock<ISpriteRepository> SpriteRepo = new();
        public readonly Mock<IEnvironmentMapRepository> EnvMapRepo = new();
        public readonly Mock<IFileUtilityService> Hasher = new();
        public readonly Mock<IDateTimeProvider> Clock = new();
        public readonly Mock<IUnitOfWork> Uow = new();
        public readonly Mock<IStoreImportProgressNotifier> Notifier = new();

        public readonly DateTime Now = new(2026, 7, 16, 0, 0, 0, DateTimeKind.Utc);
        public readonly StoreImportJob Job;
        private readonly Dictionary<string, byte[]> _downloads = new();

        public Harness()
        {
            Clock.Setup(x => x.UtcNow).Returns(Now);
            Job = StoreImportJob.Create(StoreUrl, AssetId, Now).WithId(JobId);
            JobRepo.Setup(r => r.GetByIdAsync(JobId, It.IsAny<CancellationToken>())).ReturnsAsync(Job);

            // Defaults: no existing pack, no dedupe hits.
            PackRepo.Setup(r => r.GetByStoreImportAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>())).ReturnsAsync((Pack?)null);
            ModelRepo.Setup(r => r.GetByFileHashAsync(It.IsAny<string>(), It.IsAny<CancellationToken>())).ReturnsAsync((Model?)null);
            TextureSetRepo.Setup(r => r.GetByFileHashAsync(It.IsAny<string>(), It.IsAny<CancellationToken>())).ReturnsAsync((TextureSet?)null);
            SoundRepo.Setup(r => r.GetByFileHashAsync(It.IsAny<string>(), It.IsAny<CancellationToken>())).ReturnsAsync((Sound?)null);
            SpriteRepo.Setup(r => r.GetByFileHashAsync(It.IsAny<string>(), It.IsAny<CancellationToken>())).ReturnsAsync((Sprite?)null);
            EnvMapRepo.Setup(r => r.GetByFileHashAsync(It.IsAny<string>(), It.IsAny<CancellationToken>())).ReturnsAsync((EnvironmentMap?)null);

            Sink.Setup(s => s.CreatePackAsync(It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<CancellationToken>())).ReturnsAsync(NewPackId);

            // Fake hasher computes the real SHA-256 of the uploaded bytes so a manifest hash
            // set to the same value matches, and a wrong one triggers a mismatch.
            Hasher.Setup(h => h.CalculateFileHashAsync(It.IsAny<IFileUpload>(), It.IsAny<CancellationToken>()))
                .Returns<IFileUpload, CancellationToken>((f, _) => Task.FromResult(Sha256Hex(ReadAll(f))));

            // Fake client returns the bytes registered for a download URL.
            Client.Setup(c => c.DownloadFileAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<long>(), It.IsAny<CancellationToken>()))
                .Returns<string, string, string, long, CancellationToken>((_, url, _, _, _) =>
                    Task.FromResult(_downloads.TryGetValue(url, out var bytes) ? bytes : Array.Empty<byte>()));

            Notifier.Setup(n => n.NotifyAsync(It.IsAny<StoreImportProgress>(), It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);
        }

        public StoreManifestFile MakeFile(string url, byte[] bytes, string role, string fileName, string? sha256 = null)
        {
            _downloads[url] = bytes;
            return new StoreManifestFile(fileName, bytes.Length, sha256 ?? Sha256Hex(bytes), role, url);
        }

        public void SetManifest(StoreManifestItem item, IReadOnlyList<string>? tags = null)
            => SetManifest(new[] { item }, tags);

        public void SetManifest(StoreManifestItem a, StoreManifestItem b, IReadOnlyList<string>? tags = null)
            => SetManifest(new[] { a, b }, tags);

        public void SetManifest(IReadOnlyList<StoreManifestItem> items, IReadOnlyList<string>? tags = null)
        {
            var manifest = new StoreManifest(1, "Chair Pack", "A pack", "CC0", tags, items, null);
            Client.Setup(c => c.FetchManifestAsync(StoreUrl, AssetId, Token, It.IsAny<CancellationToken>())).ReturnsAsync(manifest);
        }

        public Task Run()
        {
            var processor = new StoreImportProcessor(
                Client.Object, Sink.Object, JobRepo.Object, PackRepo.Object, ModelRepo.Object,
                TextureSetRepo.Object, SoundRepo.Object, SpriteRepo.Object, EnvMapRepo.Object,
                Hasher.Object, Clock.Object, Uow.Object, Notifier.Object,
                NullLogger<StoreImportProcessor>.Instance);

            return processor.ProcessAsync(new StoreImportWorkItem(JobId, StoreUrl, AssetId, Token), CancellationToken.None);
        }
    }
}
