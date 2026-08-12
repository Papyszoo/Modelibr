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
        h.Sink.Setup(s => s.CreateModelAsync(It.IsAny<IFileUpload>(), "Chair", It.IsAny<string?>(), It.IsAny<bool>(), It.IsAny<CancellationToken>())).ReturnsAsync(101);

        await h.Run();

        h.Sink.Verify(s => s.CreateModelAsync(It.IsAny<IFileUpload>(), "Chair", It.IsAny<string?>(), It.IsAny<bool>(), It.IsAny<CancellationToken>()), Times.Once);
        h.Sink.Verify(s => s.AddFileToModelAsync(101, It.IsAny<IFileUpload>(), It.IsAny<CancellationToken>()), Times.Once);
        h.Sink.Verify(s => s.SetModelTagsAsync(101, It.Is<IReadOnlyCollection<string>>(t => t.Contains("furniture")), "Chair", It.IsAny<int?>(), It.IsAny<CancellationToken>()), Times.Once);
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
        h.Sink.Setup(s => s.CreateTextureSetAsync(It.IsAny<IFileUpload>(), "Bricks", TextureType.Albedo, It.IsAny<string?>(), It.IsAny<int?>(), It.IsAny<CancellationToken>())).ReturnsAsync(201);
        h.Sink.Setup(s => s.UploadTextureFileAsync(201, It.IsAny<IFileUpload>(), It.IsAny<CancellationToken>())).ReturnsAsync(301);

        await h.Run();

        h.Sink.Verify(s => s.CreateTextureSetAsync(It.IsAny<IFileUpload>(), "Bricks", TextureType.Albedo, It.IsAny<string?>(), It.IsAny<int?>(), It.IsAny<CancellationToken>()), Times.Once);
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
        h.Sink.Setup(s => s.CreateTextureSetAsync(It.IsAny<IFileUpload>(), "Glass", TextureType.Alpha, It.IsAny<string?>(), It.IsAny<int?>(), It.IsAny<CancellationToken>())).ReturnsAsync(202);

        await h.Run();

        h.Sink.Verify(s => s.CreateTextureSetAsync(It.IsAny<IFileUpload>(), "Glass", TextureType.Alpha, It.IsAny<string?>(), It.IsAny<int?>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Process_SpriteItem_CreatesSpriteAndAddsToPack()
    {
        var h = new Harness();
        var file = h.MakeFile("u/sprite", RandomBytes(), "Image", "hero.png");
        h.SetManifest(Item("Sprite", "Hero", file));
        h.Sink.Setup(s => s.CreateSpriteAsync(It.IsAny<IFileUpload>(), "Hero", It.IsAny<string?>(), It.IsAny<int?>(), It.IsAny<CancellationToken>())).ReturnsAsync(501);

        await h.Run();

        h.Sink.Verify(s => s.CreateSpriteAsync(It.IsAny<IFileUpload>(), "Hero", It.IsAny<string?>(), It.IsAny<int?>(), It.IsAny<CancellationToken>()), Times.Once);
        h.Sink.Verify(s => s.AddSpriteToPackAsync(NewPackId, 501, It.IsAny<CancellationToken>()), Times.Once);
        Assert.Equal(1, h.Job.ItemsCreated);
    }

    [Fact]
    public async Task Process_SoundItem_CreatesSoundAndAddsToPack()
    {
        var h = new Harness();
        var file = h.MakeFile("u/sound", RandomBytes(), "Audio", "boom.wav");
        h.SetManifest(Item("Sound", "Boom", file));
        h.Sink.Setup(s => s.CreateSoundAsync(It.IsAny<IFileUpload>(), "Boom", It.IsAny<string?>(), It.IsAny<int?>(), It.IsAny<CancellationToken>())).ReturnsAsync(401);

        await h.Run();

        h.Sink.Verify(s => s.CreateSoundAsync(It.IsAny<IFileUpload>(), "Boom", It.IsAny<string?>(), It.IsAny<int?>(), It.IsAny<CancellationToken>()), Times.Once);
        h.Sink.Verify(s => s.AddSoundToPackAsync(NewPackId, 401, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Process_SoundItem_WithExtraFiles_ImportsAudioPrimaryAndReportsSurplus()
    {
        var h = new Harness();
        // The audio file is deliberately NOT first: the primary must be picked by role.
        var art = h.MakeFile("u/cover", RandomBytes(), "Image", "cover.png");
        var audio = h.MakeFile("u/audio", RandomBytes(), "Audio", "boom.wav");
        h.SetManifest(Item("Sound", "Boom", art, audio));
        h.Sink.Setup(s => s.CreateSoundAsync(It.IsAny<IFileUpload>(), "Boom", It.IsAny<string?>(), It.IsAny<int?>(), It.IsAny<CancellationToken>())).ReturnsAsync(401);

        await h.Run();

        h.Sink.Verify(s => s.CreateSoundAsync(
            It.Is<IFileUpload>(u => u.FileName == "boom.wav"), "Boom", It.IsAny<string?>(), It.IsAny<int?>(), It.IsAny<CancellationToken>()), Times.Once);
        Assert.Equal(1, h.Job.ItemsCreated);
        // Sounds are single-file assets; the dropped surplus must be visible in the outcome.
        Assert.Contains("additional file(s) not imported", h.Job.ResultJson);
    }

    [Fact]
    public async Task Process_EnvironmentMapItem_CreatesEnvMapAndAddsToPack()
    {
        var h = new Harness();
        var file = h.MakeFile("u/env", RandomBytes(), "Panorama", "sky.hdr");
        h.SetManifest(Item("EnvironmentMap", "Sky", file));
        h.Sink.Setup(s => s.CreateEnvironmentMapAsync(It.IsAny<IFileUpload>(), "Sky", It.IsAny<string?>(), It.IsAny<CancellationToken>())).ReturnsAsync(601);

        await h.Run();

        h.Sink.Verify(s => s.CreateEnvironmentMapAsync(It.IsAny<IFileUpload>(), "Sky", It.IsAny<string?>(), It.IsAny<CancellationToken>()), Times.Once);
        h.Sink.Verify(s => s.AddEnvironmentMapToPackAsync(NewPackId, 601, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Process_OtherItem_SkippedAndReported_NoDownload()
    {
        var h = new Harness();
        var file = h.MakeFile("u/other", RandomBytes(), "Unknown", "notes.txt");
        h.SetManifest(Item("Other", "Notes", file));

        await h.Run();

        h.Client.Verify(c => c.DownloadFileAsync(It.IsAny<string>(), "u/other", It.IsAny<string>(), It.IsAny<long>(), It.IsAny<long?>(), It.IsAny<CancellationToken>()), Times.Never);
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
            .ReturnsAsync(ExistingModel(55, mesh));

        await h.Run();

        h.Client.Verify(c => c.DownloadFileAsync(It.IsAny<string>(), "u/mesh", It.IsAny<string>(), It.IsAny<long>(), It.IsAny<long?>(), It.IsAny<CancellationToken>()), Times.Never);
        h.Sink.Verify(s => s.CreateModelAsync(It.IsAny<IFileUpload>(), It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<bool>(), It.IsAny<CancellationToken>()), Times.Never);
        h.Sink.Verify(s => s.AddModelToPackAsync(NewPackId, 55, It.IsAny<CancellationToken>()), Times.Once);
        Assert.Equal(1, h.Job.ItemsSkipped);
        Assert.Equal(0, h.Job.ItemsCreated);
        Assert.Contains("skipped-dedupe", h.Job.ResultJson);
    }

    [Fact]
    public async Task Process_ModelItem_WhenDeduped_GapFillsFilesMissingFromExistingModel()
    {
        var h = new Harness();
        var mesh = h.MakeFile("u/mesh", RandomBytes(), "Mesh", "chair.glb");
        var extra = h.MakeFile("u/extra", RandomBytes(), "Image", "chair_albedo.png");
        h.SetManifest(Item("Model", "Chair", mesh, extra));
        // The existing model has the mesh but a previous partial run never attached the extra.
        h.ModelRepo.Setup(r => r.GetByFileHashAsync(mesh.Sha256, It.IsAny<CancellationToken>()))
            .ReturnsAsync(ExistingModel(55, mesh));

        await h.Run();

        h.Client.Verify(c => c.DownloadFileAsync(It.IsAny<string>(), "u/mesh", It.IsAny<string>(), It.IsAny<long>(), It.IsAny<long?>(), It.IsAny<CancellationToken>()), Times.Never);
        h.Sink.Verify(s => s.AddFileToModelAsync(55, It.Is<IFileUpload>(u => u.FileName == "chair_albedo.png"), It.IsAny<CancellationToken>()), Times.Once);
        h.Sink.Verify(s => s.AddModelToPackAsync(NewPackId, 55, It.IsAny<CancellationToken>()), Times.Once);
        Assert.Equal(1, h.Job.ItemsSkipped);
        Assert.Contains("gap-filled 1 missing file(s)", h.Job.ResultJson);
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
            .ReturnsAsync(ExistingModel(55, mesh));
        h.Sink.Setup(s => s.CreateSoundAsync(It.IsAny<IFileUpload>(), "Creak", It.IsAny<string?>(), It.IsAny<int?>(), It.IsAny<CancellationToken>())).ReturnsAsync(401);

        await h.Run();

        h.Sink.Verify(s => s.CreatePackAsync(
            It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<string?>(),
            It.IsAny<string>(), It.IsAny<string>(), It.IsAny<int>(), It.IsAny<CancellationToken>()), Times.Never);
        h.Sink.Verify(s => s.RecordPackProvenanceAsync(9, StoreUrl, AssetId, 1, It.IsAny<CancellationToken>()), Times.Once);
        h.Sink.Verify(s => s.AddModelToPackAsync(9, 55, It.IsAny<CancellationToken>()), Times.Once);
        h.Sink.Verify(s => s.AddSoundToPackAsync(9, 401, It.IsAny<CancellationToken>()), Times.Once);
        Assert.Equal(9, h.Job.PackId);
        Assert.Equal(1, h.Job.ItemsCreated);
        Assert.Equal(1, h.Job.ItemsSkipped);
    }

    // ---- hash mismatch fails one item, pack continues ----

    [Fact]
    public async Task Process_WhenHashMismatch_ItemFails_PackContinues_AndTrackerIsReset()
    {
        var h = new Harness();
        var badMesh = h.MakeFile("u/mesh", RandomBytes(), "Mesh", "chair.glb", sha256: new string('0', 64));
        var goodSound = h.MakeFile("u/sound", RandomBytes(), "Audio", "boom.wav");
        h.SetManifest(
            Item("Model", "Chair", badMesh),
            Item("Sound", "Boom", goodSound));
        h.Sink.Setup(s => s.CreateSoundAsync(It.IsAny<IFileUpload>(), "Boom", It.IsAny<string?>(), It.IsAny<int?>(), It.IsAny<CancellationToken>())).ReturnsAsync(401);

        await h.Run();

        h.Sink.Verify(s => s.CreateModelAsync(It.IsAny<IFileUpload>(), It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<bool>(), It.IsAny<CancellationToken>()), Times.Never);
        h.Sink.Verify(s => s.AddSoundToPackAsync(NewPackId, 401, It.IsAny<CancellationToken>()), Times.Once);
        Assert.Equal(1, h.Job.ItemsFailed);
        Assert.Equal(1, h.Job.ItemsCreated);
        Assert.Contains("SHA-256 mismatch", h.Job.ResultJson);
        Assert.Equal(Domain.ValueObjects.StoreImportJobStatus.CompletedWithErrors, h.Job.Status);
        // A failed item may leave poisoned staged entities behind - the shared change
        // tracker must be reset so subsequent items/saves don't cascade-fail.
        h.TrackerReset.Verify(t => t.Clear(), Times.Once);
    }

    // ---- one shared batch id per import (upload-history grouping) ----

    [Fact]
    public async Task Process_StampsOneSharedBatchIdAcrossAllItems()
    {
        var h = new Harness();
        var mesh = h.MakeFile("u/mesh", RandomBytes(), "Mesh", "chair.glb");
        var audio = h.MakeFile("u/audio", RandomBytes(), "Audio", "boom.wav");
        h.SetManifest(new[] { Item("Model", "Chair", mesh), Item("Sound", "Boom", audio) });
        h.Sink.Setup(s => s.CreateModelAsync(It.IsAny<IFileUpload>(), "Chair", It.IsAny<string?>(), It.IsAny<bool>(), It.IsAny<CancellationToken>())).ReturnsAsync(101);
        h.Sink.Setup(s => s.CreateSoundAsync(It.IsAny<IFileUpload>(), "Boom", It.IsAny<string?>(), It.IsAny<int?>(), It.IsAny<CancellationToken>())).ReturnsAsync(401);

        await h.Run();

        // Every created asset shares the job's batch id so History renders one batch, not N rows.
        var batch = $"store-import-{JobId}";
        h.Sink.Verify(s => s.CreateModelAsync(It.IsAny<IFileUpload>(), "Chair", batch, It.IsAny<bool>(), It.IsAny<CancellationToken>()), Times.Once);
        h.Sink.Verify(s => s.CreateSoundAsync(It.IsAny<IFileUpload>(), "Boom", batch, It.IsAny<int?>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    // ---- reuse store thumbnails instead of regenerating ----

    [Fact]
    public async Task Process_ModelItem_WithStoreTurntable_ReusesItAndSuppressesGeneration()
    {
        var h = new Harness();
        var mesh = h.MakeFile("u/mesh", RandomBytes(), "Mesh", "chair.glb");
        var turntable = h.MakePreview("u/turntable", "Turntable", "image/webp", "chair.webp");
        h.SetManifest(new StoreManifestItem("Model", "Chair", new[] { mesh }, new[] { turntable }, "item-1"));
        h.Sink.Setup(s => s.CreateModelAsync(It.IsAny<IFileUpload>(), "Chair", It.IsAny<string?>(), It.IsAny<bool>(), It.IsAny<CancellationToken>())).ReturnsAsync(101);

        await h.Run();

        // generateThumbnail:false AND the store thumbnail attached to the new model.
        h.Sink.Verify(s => s.CreateModelAsync(It.IsAny<IFileUpload>(), "Chair", It.IsAny<string?>(), false, It.IsAny<CancellationToken>()), Times.Once);
        h.Sink.Verify(s => s.SetModelThumbnailFromFileAsync(101, It.IsAny<IFileUpload>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Process_ModelItem_WithoutReusableThumbnail_GeneratesLocally()
    {
        var h = new Harness();
        var mesh = h.MakeFile("u/mesh", RandomBytes(), "Mesh", "chair.glb");
        // A 3D preview model is not a reusable <img> thumbnail - must fall back to generation.
        var model3d = h.MakePreview("u/model", "PreviewModel", "model/gltf-binary", "chair.glb");
        h.SetManifest(new StoreManifestItem("Model", "Chair", new[] { mesh }, new[] { model3d }, "item-1"));
        h.Sink.Setup(s => s.CreateModelAsync(It.IsAny<IFileUpload>(), "Chair", It.IsAny<string?>(), It.IsAny<bool>(), It.IsAny<CancellationToken>())).ReturnsAsync(101);

        await h.Run();

        h.Sink.Verify(s => s.CreateModelAsync(It.IsAny<IFileUpload>(), "Chair", It.IsAny<string?>(), true, It.IsAny<CancellationToken>()), Times.Once);
        h.Sink.Verify(s => s.SetModelThumbnailFromFileAsync(It.IsAny<int>(), It.IsAny<IFileUpload>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    // ---- partial import: only selected manifest items ----

    [Fact]
    public async Task Process_WithSelectedItemIds_ImportsOnlySelectedItems()
    {
        var h = new Harness();
        var meshA = h.MakeFile("u/a", RandomBytes(), "Mesh", "a.glb");
        var meshB = h.MakeFile("u/b", RandomBytes(), "Mesh", "b.glb");
        h.SetManifest(new[]
        {
            new StoreManifestItem("Model", "A", new[] { meshA }, null, "item-a"),
            new StoreManifestItem("Model", "B", new[] { meshB }, null, "item-b"),
        });
        h.Sink.Setup(s => s.CreateModelAsync(It.IsAny<IFileUpload>(), It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<bool>(), It.IsAny<CancellationToken>())).ReturnsAsync(101);

        await h.Run(selectedItemIds: new[] { "item-b" });

        h.Sink.Verify(s => s.CreateModelAsync(It.IsAny<IFileUpload>(), "B", It.IsAny<string?>(), It.IsAny<bool>(), It.IsAny<CancellationToken>()), Times.Once);
        h.Sink.Verify(s => s.CreateModelAsync(It.IsAny<IFileUpload>(), "A", It.IsAny<string?>(), It.IsAny<bool>(), It.IsAny<CancellationToken>()), Times.Never);
        // The unselected item is never even downloaded.
        h.Client.Verify(c => c.DownloadFileAsync(It.IsAny<string>(), "u/a", It.IsAny<string>(), It.IsAny<long>(), It.IsAny<long?>(), It.IsAny<CancellationToken>()), Times.Never);
        Assert.Equal(1, h.Job.ItemsCreated);
    }

    // ---- item categories (store taxonomy → Modelibr categories) ----

    [Fact]
    public async Task Process_SoundItem_WithCategoryMetadata_CreatesSoundInResolvedCategory()
    {
        var h = new Harness();
        var file = h.MakeFile("u/sound", RandomBytes(), "Audio", "click.ogg");
        h.SetManifest(new StoreManifestItem("Sound", "Click", new[] { file }, null, "item-1", """{"category": "UI"}"""));
        h.CategoryResolver
            .Setup(r => r.ResolveAsync(StoreManifestMapping.ImportTarget.Sound, "UI", It.IsAny<CancellationToken>()))
            .ReturnsAsync(77);
        h.Sink.Setup(s => s.CreateSoundAsync(It.IsAny<IFileUpload>(), "Click", It.IsAny<string?>(), 77, It.IsAny<CancellationToken>())).ReturnsAsync(401);

        await h.Run();

        h.Sink.Verify(s => s.CreateSoundAsync(It.IsAny<IFileUpload>(), "Click", It.IsAny<string?>(), 77, It.IsAny<CancellationToken>()), Times.Once);
        Assert.Equal(1, h.Job.ItemsCreated);
    }

    [Fact]
    public async Task Process_ModelItem_WithCategoryButNoTags_StillAppliesCategoryViaTagsCommand()
    {
        var h = new Harness();
        var mesh = h.MakeFile("u/mesh", RandomBytes(), "Mesh", "chair.glb");
        h.SetManifest(new StoreManifestItem("Model", "Chair", new[] { mesh }, null, "item-1", """{"category": "Furniture"}"""));
        h.CategoryResolver
            .Setup(r => r.ResolveAsync(StoreManifestMapping.ImportTarget.Model, "Furniture", It.IsAny<CancellationToken>()))
            .ReturnsAsync(88);
        h.Sink.Setup(s => s.CreateModelAsync(It.IsAny<IFileUpload>(), "Chair", It.IsAny<string?>(), It.IsAny<bool>(), It.IsAny<CancellationToken>())).ReturnsAsync(101);

        await h.Run();

        // No manifest tags, but the category still needs the UpdateModelTags path - that is
        // the one command that assigns model categories.
        h.Sink.Verify(s => s.SetModelTagsAsync(101, It.Is<IReadOnlyCollection<string>>(t => t.Count == 0), "Chair", 88, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Process_EnvironmentMapItem_WithCategory_AppliesItAfterCreation()
    {
        var h = new Harness();
        var file = h.MakeFile("u/env", RandomBytes(), "Panorama", "sky.hdr");
        h.SetManifest(new StoreManifestItem("EnvironmentMap", "Sky", new[] { file }, null, "item-1", """{"category": "Sky"}"""));
        h.CategoryResolver
            .Setup(r => r.ResolveAsync(StoreManifestMapping.ImportTarget.EnvironmentMap, "Sky", It.IsAny<CancellationToken>()))
            .ReturnsAsync(99);
        h.Sink.Setup(s => s.CreateEnvironmentMapAsync(It.IsAny<IFileUpload>(), "Sky", It.IsAny<string?>(), It.IsAny<CancellationToken>())).ReturnsAsync(601);

        await h.Run();

        h.Sink.Verify(s => s.SetEnvironmentMapCategoryAsync(601, 99, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Process_DedupedUncategorizedSound_GapFillsTheManifestCategory()
    {
        var h = new Harness();
        var file = h.MakeFile("u/sound", RandomBytes(), "Audio", "click.ogg");
        h.SetManifest(new StoreManifestItem("Sound", "Click", new[] { file }, null, "item-1", """{"category": "UI"}"""));
        h.SoundRepo.Setup(r => r.GetByFileHashAsync(file.Sha256, It.IsAny<CancellationToken>()))
            .ReturnsAsync(ExistingSound(44));
        h.CategoryResolver
            .Setup(r => r.ResolveAsync(StoreManifestMapping.ImportTarget.Sound, "UI", It.IsAny<CancellationToken>()))
            .ReturnsAsync(77);

        await h.Run();

        // Re-running an import categorizes assets that predate category support -
        // the same repair contract as the file gap-fill.
        h.Sink.Verify(s => s.SetSoundCategoryAsync(44, 77, It.IsAny<CancellationToken>()), Times.Once);
        Assert.Equal(1, h.Job.ItemsSkipped);
    }

    [Fact]
    public async Task Process_DedupedAlreadyCategorizedSound_KeepsItsCategory()
    {
        var h = new Harness();
        var file = h.MakeFile("u/sound", RandomBytes(), "Audio", "click.ogg");
        h.SetManifest(new StoreManifestItem("Sound", "Click", new[] { file }, null, "item-1", """{"category": "UI"}"""));
        h.SoundRepo.Setup(r => r.GetByFileHashAsync(file.Sha256, It.IsAny<CancellationToken>()))
            .ReturnsAsync(ExistingSound(44, categoryId: 5));

        await h.Run();

        // An existing categorization - the user's or an earlier import's - is never
        // overwritten, and no find-or-create side effects happen either.
        h.CategoryResolver.Verify(r => r.ResolveAsync(It.IsAny<StoreManifestMapping.ImportTarget>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()), Times.Never);
        h.Sink.Verify(s => s.SetSoundCategoryAsync(It.IsAny<int>(), It.IsAny<int>(), It.IsAny<CancellationToken>()), Times.Never);
        Assert.Equal(1, h.Job.ItemsSkipped);
    }

    [Fact]
    public async Task ProcessAsync_FailsJob_WhenManifestSchemaIsNewerThanSupported()
    {
        var h = new Harness();
        var mesh = h.MakeFile("u/mesh", RandomBytes(), "Mesh", "chair.glb");
        h.SetManifest(new[] { Item("Model", "Chair", mesh) }, schemaVersion: 2);

        await h.Run();

        // A schema this importer does not understand must not be imported on v1 assumptions.
        Assert.Equal(Domain.ValueObjects.StoreImportJobStatus.Failed, h.Job.Status);
        Assert.Contains("schema version 2", h.Job.ErrorMessage);
        h.Sink.Verify(s => s.CreateModelAsync(It.IsAny<IFileUpload>(), It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<bool>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    // Regression: HttpClient.Timeout surfaces as TaskCanceledException. Treating every
    // OperationCanceledException as host shutdown abandoned the job as Running forever,
    // and the UI polled it every 2.5s with no terminal state ever arriving.
    [Fact]
    public async Task ProcessAsync_FailsItem_WhenDownloadTimesOut_AndStillCompletesTheJob()
    {
        var h = new Harness();
        var slow = h.MakeFile("u/slow", RandomBytes(), "Mesh", "slow.glb");
        var ok = h.MakeFile("u/ok", RandomBytes(), "Audio", "boom.wav");
        h.SetManifest(new[] { Item("Model", "Chair", slow), Item("Sound", "Boom", ok) });
        h.FailDownload("u/slow", new TaskCanceledException("The request was canceled due to the configured HttpClient.Timeout of 100 seconds elapsing."));
        h.Sink.Setup(s => s.CreateSoundAsync(It.IsAny<IFileUpload>(), "Boom", It.IsAny<string?>(), It.IsAny<int?>(), It.IsAny<CancellationToken>())).ReturnsAsync(401);

        await h.Run();

        Assert.Equal(Domain.ValueObjects.StoreImportJobStatus.CompletedWithErrors, h.Job.Status);
        Assert.Equal(1, h.Job.ItemsFailed);
        Assert.Equal(1, h.Job.ItemsCreated); // the timeout did not abort the remaining items
    }

    [Fact]
    public async Task ProcessAsync_FailsJob_WhenManifestFetchTimesOut()
    {
        var h = new Harness();
        h.Client
            .Setup(c => c.FetchManifestAsync(StoreUrl, AssetId, Token, It.IsAny<CancellationToken>()))
            .ThrowsAsync(new TaskCanceledException("HttpClient.Timeout elapsed."));

        await h.Run();

        Assert.Equal(Domain.ValueObjects.StoreImportJobStatus.Failed, h.Job.Status);
    }

    [Fact]
    public async Task ProcessAsync_LeavesJobRunning_OnHostShutdownCancellation()
    {
        var h = new Harness();
        var mesh = h.MakeFile("u/mesh", RandomBytes(), "Mesh", "chair.glb");
        h.SetManifest(new[] { Item("Model", "Chair", mesh) });
        using var cts = new CancellationTokenSource();
        h.Client
            .Setup(c => c.FetchManifestAsync(StoreUrl, AssetId, Token, It.IsAny<CancellationToken>()))
            .ThrowsAsync(new OperationCanceledException(cts.Token));
        cts.Cancel();

        await h.Run(cancellationToken: cts.Token);

        // Genuine shutdown: the startup sweep marks interrupted jobs Failed on next boot.
        Assert.Equal(Domain.ValueObjects.StoreImportJobStatus.Running, h.Job.Status);
    }

    [Fact]
    public async Task ProcessAsync_RecordsListingUrl_MatchingTheStorefrontRoute()
    {
        var h = new Harness();
        var mesh = h.MakeFile("u/mesh", RandomBytes(), "Mesh", "chair.glb");
        h.SetManifest(Item("Model", "Chair", mesh));
        h.Sink.Setup(s => s.CreateModelAsync(It.IsAny<IFileUpload>(), It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<bool>(), It.IsAny<CancellationToken>())).ReturnsAsync(101);

        await h.Run();

        // The storefront serves asset detail at /assets/:id - /asset/:id 404s.
        h.Sink.Verify(s => s.CreatePackAsync(
            It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<string?>(),
            $"{StoreUrl}/assets/{AssetId}",
            It.IsAny<string>(), It.IsAny<string>(), It.IsAny<int>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    // Regression: provenance used to be a SECOND commit after CreatePackAsync, so a crash
    // between the two left a pack with no idempotency key and the next import created a
    // duplicate. Creation must carry the stamp itself.
    [Fact]
    public async Task ProcessAsync_StampsProvenance_InTheSameCallThatCreatesThePack()
    {
        var h = new Harness();
        var mesh = h.MakeFile("u/mesh", RandomBytes(), "Mesh", "chair.glb");
        h.SetManifest(Item("Model", "Chair", mesh));
        h.Sink.Setup(s => s.CreateModelAsync(It.IsAny<IFileUpload>(), It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<bool>(), It.IsAny<CancellationToken>())).ReturnsAsync(101);

        await h.Run();

        h.Sink.Verify(s => s.CreatePackAsync(
            It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<string?>(),
            StoreUrl, AssetId, 1, It.IsAny<CancellationToken>()), Times.Once);
        // No follow-up stamp for a freshly created pack - that path is for re-imports only.
        h.Sink.Verify(s => s.RecordPackProvenanceAsync(
            It.IsAny<int>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<int>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    // Regression: two concurrent imports of the same store asset both pass the
    // GetByStoreImportAsync lookup; the unique index rejects the loser's insert. The loser must
    // adopt the winner's pack instead of failing the whole job.
    [Fact]
    public async Task ProcessAsync_WhenPackCreationLosesTheRace_AdoptsTheConcurrentlyCreatedPack()
    {
        var h = new Harness();
        var mesh = h.MakeFile("u/mesh", RandomBytes(), "Mesh", "chair.glb");
        h.SetManifest(Item("Model", "Chair", mesh));
        h.Sink.Setup(s => s.CreateModelAsync(It.IsAny<IFileUpload>(), It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<bool>(), It.IsAny<CancellationToken>())).ReturnsAsync(101);
        h.Sink.Setup(s => s.CreatePackAsync(
                It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<string?>(),
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("duplicate key value violates unique constraint"));

        // The winner's pack is visible by the time we re-resolve.
        var winner = Pack.Create("Chair Pack", null, null, null, h.Now).WithId(77);
        h.PackRepo.SetupSequence(r => r.GetByStoreImportAsync(StoreUrl, AssetId, It.IsAny<CancellationToken>()))
            .ReturnsAsync((Pack?)null)
            .ReturnsAsync(winner);

        await h.Run();

        Assert.Equal(77, h.Job.PackId);
        Assert.Equal(Domain.ValueObjects.StoreImportJobStatus.Completed, h.Job.Status);
        h.Sink.Verify(s => s.AddModelToPackAsync(77, 101, It.IsAny<CancellationToken>()), Times.Once);
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

    private static Sound ExistingSound(int id, int? categoryId = null)
    {
        var now = DateTime.UtcNow;
        var file = Domain.Models.File.Create(
            "existing.ogg", "existing.ogg", "uploads/existing.ogg", "audio/ogg",
            FileType.Unknown, 10, new string('a', 64), now).WithId(1);
        return Sound.Create("Existing Sound", file, 0, null, now, categoryId).WithId(id);
    }

    /// <summary>
    /// A persisted-looking model whose active version carries files with the given manifest
    /// hashes - the shape the gap-fill check inspects.
    /// </summary>
    private static Model ExistingModel(int id, params StoreManifestFile[] files)
    {
        var now = DateTime.UtcNow;
        var model = Model.Create("Existing Model", now).WithId(id);
        var version = ModelVersion.Create(id, 1, null, now);
        foreach (var file in files)
        {
            version.AddFile(Domain.Models.File.Create(
                file.FileName, file.FileName, $"uploads/{file.FileName}", "application/octet-stream",
                FileType.Unknown, file.FileSize, file.Sha256, now));
        }
        model.Versions.Add(version);
        return model;
    }

    private sealed class Harness
    {
        public readonly Mock<IStoreImportClient> Client = new();
        public readonly Mock<IStoreImportSink> Sink = new();
        public readonly Mock<IStoreImportCategoryResolver> CategoryResolver = new();
        public readonly Mock<IStoreImportJobRepository> JobRepo = new();
        public readonly Mock<IPackRepository> PackRepo = new();
        public readonly Mock<IModelRepository> ModelRepo = new();
        public readonly Mock<ITextureSetRepository> TextureSetRepo = new();
        public readonly Mock<ISoundRepository> SoundRepo = new();
        public readonly Mock<ISpriteRepository> SpriteRepo = new();
        public readonly Mock<IEnvironmentMapRepository> EnvMapRepo = new();
        public readonly Mock<IDateTimeProvider> Clock = new();
        public readonly Mock<IUnitOfWork> Uow = new();
        public readonly Mock<IChangeTrackerReset> TrackerReset = new();
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

            Sink.Setup(s => s.CreatePackAsync(
                It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<string?>(),
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<int>(), It.IsAny<CancellationToken>())).ReturnsAsync(NewPackId);

            // Default: items resolve to no category (the common uncategorized-manifest case).
            CategoryResolver
                .Setup(r => r.ResolveAsync(It.IsAny<StoreManifestMapping.ImportTarget>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync((int?)null);

            // Fake client parks the bytes registered for a URL in a real temp file and
            // hashes them like the real client does, so manifest-hash equality decides
            // match vs mismatch exactly as in production.
            Client.Setup(c => c.DownloadFileAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<long>(), It.IsAny<long?>(), It.IsAny<CancellationToken>()))
                .Returns<string, string, string, long, long?, CancellationToken>((_, url, _, _, _, _) =>
                {
                    var bytes = _downloads.TryGetValue(url, out var b) ? b : Array.Empty<byte>();
                    var path = Path.Combine(Path.GetTempPath(), "modelibr-test-" + Guid.NewGuid().ToString("N") + ".tmp");
                    System.IO.File.WriteAllBytes(path, bytes);
                    return Task.FromResult(new StoreDownloadedFile(path, Sha256Hex(bytes), bytes.Length));
                });

            Notifier.Setup(n => n.NotifyAsync(It.IsAny<StoreImportProgress>(), It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);
        }

        public StoreManifestFile MakeFile(string url, byte[] bytes, string role, string fileName, string? sha256 = null)
        {
            _downloads[url] = bytes;
            return new StoreManifestFile(fileName, bytes.Length, sha256 ?? Sha256Hex(bytes), role, url);
        }

        /// <summary>An item preview whose bytes are downloadable via the fake client (previews carry no SHA).</summary>
        public StoreManifestPreview MakePreview(string url, string type, string contentType, string fileName)
        {
            _downloads[url] = RandomBytes();
            return new StoreManifestPreview(type, fileName, contentType, url);
        }

        public void SetManifest(StoreManifestItem item, IReadOnlyList<string>? tags = null)
            => SetManifest(new[] { item }, tags);

        public void SetManifest(StoreManifestItem a, StoreManifestItem b, IReadOnlyList<string>? tags = null)
            => SetManifest(new[] { a, b }, tags);

        public void SetManifest(IReadOnlyList<StoreManifestItem> items, IReadOnlyList<string>? tags = null, int schemaVersion = 1)
        {
            var manifest = new StoreManifest(schemaVersion, "Chair Pack", "A pack", "CC0", tags, items, null);
            Client.Setup(c => c.FetchManifestAsync(StoreUrl, AssetId, Token, It.IsAny<CancellationToken>())).ReturnsAsync(manifest);
        }

        /// <summary>Makes the fake client throw for one download URL (network failure simulation).</summary>
        public void FailDownload(string url, Exception exception)
            => Client.Setup(c => c.DownloadFileAsync(It.IsAny<string>(), url, It.IsAny<string>(), It.IsAny<long>(), It.IsAny<long?>(), It.IsAny<CancellationToken>()))
                .ThrowsAsync(exception);

        public Task Run(IReadOnlyList<string>? selectedItemIds = null, CancellationToken cancellationToken = default)
        {
            var processor = new StoreImportProcessor(
                Client.Object, Sink.Object, CategoryResolver.Object, JobRepo.Object, PackRepo.Object, ModelRepo.Object,
                TextureSetRepo.Object, SoundRepo.Object, SpriteRepo.Object, EnvMapRepo.Object,
                Clock.Object, Uow.Object, TrackerReset.Object, Notifier.Object,
                NullLogger<StoreImportProcessor>.Instance);

            return processor.ProcessAsync(
                new StoreImportWorkItem(JobId, StoreUrl, AssetId, Token, selectedItemIds), cancellationToken);
        }
    }
}
