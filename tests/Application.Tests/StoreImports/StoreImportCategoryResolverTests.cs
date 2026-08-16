using Application.Abstractions.Messaging;
using Application.EnvironmentMapCategories;
using Application.ModelCategories;
using Application.Models;
using Application.SoundCategories;
using Application.SpriteCategories;
using Application.StoreImports;
using Application.TextureSetCategories;
using Domain.ValueObjects;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using SharedKernel;
using Xunit;

namespace Application.Tests.StoreImports;

public class StoreImportCategoryResolverTests
{
    [Fact]
    public async Task Resolve_WhenRootCategoryExists_ReturnsItWithoutCreating_CaseInsensitively()
    {
        var h = new Harness();
        h.SetSoundCategories(
            new SoundCategorySummaryDto { Id = 3, Name = "music", ParentId = null },
            new SoundCategorySummaryDto { Id = 4, Name = "UI", ParentId = 3 });

        var id = await h.Resolver.ResolveAsync(StoreManifestMapping.ImportTarget.Sound, "Music", CancellationToken.None);

        Assert.Equal(3, id);
        h.CreateSound.Verify(c => c.Handle(It.IsAny<CreateSoundCategoryCommand>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Resolve_WhenOnlyNestedCategoryMatches_CreatesANewRootCategory()
    {
        var h = new Harness();
        // "UI" exists but only as a child - imports target root-level taxonomy names.
        h.SetSoundCategories(
            new SoundCategorySummaryDto { Id = 3, Name = "Music", ParentId = null },
            new SoundCategorySummaryDto { Id = 4, Name = "UI", ParentId = 3 });
        h.CreateSound
            .Setup(c => c.Handle(It.Is<CreateSoundCategoryCommand>(cmd => cmd.Name == "UI" && cmd.ParentId == null), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(new SoundCategorySummaryDto { Id = 9, Name = "UI" }));

        var id = await h.Resolver.ResolveAsync(StoreManifestMapping.ImportTarget.Sound, "UI", CancellationToken.None);

        Assert.Equal(9, id);
    }

    [Fact]
    public async Task Resolve_WithSubcategory_WhenBothExist_ReturnsChildId()
    {
        var h = new Harness();
        h.SetSoundCategories(
            new SoundCategorySummaryDto { Id = 3, Name = "UI", ParentId = null },
            new SoundCategorySummaryDto { Id = 4, Name = "Clicks & Cursors", ParentId = 3 });

        var id = await h.Resolver.ResolveAsync(StoreManifestMapping.ImportTarget.Sound, "UI", "Clicks & Cursors", CancellationToken.None);

        Assert.Equal(4, id);
        h.CreateSound.Verify(c => c.Handle(It.IsAny<CreateSoundCategoryCommand>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Resolve_WithSubcategory_WhenRootExists_CreatesChildWithParentId()
    {
        var h = new Harness();
        h.SetSoundCategories(
            new SoundCategorySummaryDto { Id = 3, Name = "UI", ParentId = null });
        h.CreateSound
            .Setup(c => c.Handle(It.Is<CreateSoundCategoryCommand>(cmd => cmd.Name == "Clicks & Cursors" && cmd.ParentId == 3), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(new SoundCategorySummaryDto { Id = 15, Name = "Clicks & Cursors", ParentId = 3 }));

        var id = await h.Resolver.ResolveAsync(StoreManifestMapping.ImportTarget.Sound, "UI", "Clicks & Cursors", CancellationToken.None);

        Assert.Equal(15, id);
    }

    [Fact]
    public async Task Resolve_WithSubcategory_WhenNeitherExists_CreatesRootThenChild()
    {
        var h = new Harness();
        h.SetSpriteCategories();
        h.CreateSprite
            .Setup(c => c.Handle(It.Is<CreateSpriteCategoryCommand>(cmd => cmd.Name == "UI" && cmd.ParentId == null), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(new SpriteCategorySummaryDto { Id = 10, Name = "UI", ParentId = null }));
        h.CreateSprite
            .Setup(c => c.Handle(It.Is<CreateSpriteCategoryCommand>(cmd => cmd.Name == "Buttons & Controls" && cmd.ParentId == 10), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(new SpriteCategorySummaryDto { Id = 20, Name = "Buttons & Controls", ParentId = 10 }));

        var id = await h.Resolver.ResolveAsync(StoreManifestMapping.ImportTarget.Sprite, "UI", "Buttons & Controls", CancellationToken.None);

        Assert.Equal(20, id);
    }

    [Fact]
    public async Task Resolve_WhenTheSubcategoryCannotBeCreated_FallsBackToItsParent()
    {
        // Better than uncategorized, but it must not be silent: a subcategory that can never
        // be created (a name over the domain's 100-char cap, say) would otherwise file a
        // whole import one level up with nothing anywhere explaining why.
        var h = new Harness();
        h.SetSoundCategories(new SoundCategorySummaryDto { Id = 3, Name = "UI", ParentId = null });
        h.CreateSound
            .Setup(c => c.Handle(It.Is<CreateSoundCategoryCommand>(cmd => cmd.ParentId == 3), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Failure<SoundCategorySummaryDto>(new Error("NameTooLong", "Category name is too long.")));

        var id = await h.Resolver.ResolveAsync(
            StoreManifestMapping.ImportTarget.Sound, "UI", new string('x', 200), CancellationToken.None);

        Assert.Equal(3, id);
    }

    [Fact]
    public async Task Resolve_WithSubcategory_ReadsTheCategoryListOnce()
    {
        // Both lookups are answered by one read: the queries return every category flat, so
        // an existing root's children are already in hand, and a root that was just created
        // cannot have any. A second read per distinct tuple bought nothing.
        var h = new Harness();
        h.SetSoundCategories(
            new SoundCategorySummaryDto { Id = 3, Name = "UI", ParentId = null },
            new SoundCategorySummaryDto { Id = 4, Name = "Clicks", ParentId = 3 });

        var id = await h.Resolver.ResolveAsync(
            StoreManifestMapping.ImportTarget.Sound, "UI", "Clicks", CancellationToken.None);

        Assert.Equal(4, id);
        h.GetSound.Verify(
            q => q.Handle(It.IsAny<GetAllSoundCategoriesQuery>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Resolve_CachesPerNameAndTarget_OneLookupForRepeatedItems()
    {
        var h = new Harness();
        h.SetSoundCategories();
        h.CreateSound
            .Setup(c => c.Handle(It.IsAny<CreateSoundCategoryCommand>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(new SoundCategorySummaryDto { Id = 9, Name = "Foley & Objects" }));

        for (var i = 0; i < 5; i++)
            Assert.Equal(9, await h.Resolver.ResolveAsync(StoreManifestMapping.ImportTarget.Sound, "Foley & Objects", CancellationToken.None));

        // A 1,000-item pack must not issue 1,000 lookups/creates.
        h.GetSound.Verify(q => q.Handle(It.IsAny<GetAllSoundCategoriesQuery>(), It.IsAny<CancellationToken>()), Times.Once);
        h.CreateSound.Verify(c => c.Handle(It.IsAny<CreateSoundCategoryCommand>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Resolve_WhenCreationFails_ReturnsNull_SoTheItemImportsUncategorized()
    {
        var h = new Harness();
        h.SetSoundCategories();
        h.CreateSound
            .Setup(c => c.Handle(It.IsAny<CreateSoundCategoryCommand>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Failure<SoundCategorySummaryDto>(new Error("Boom", "creation failed")));

        Assert.Null(await h.Resolver.ResolveAsync(StoreManifestMapping.ImportTarget.Sound, "UI", CancellationToken.None));
    }

    [Fact]
    public async Task Resolve_ForBlankNameOrUnsupportedTarget_ReturnsNullWithoutQuerying()
    {
        var h = new Harness();

        Assert.Null(await h.Resolver.ResolveAsync(StoreManifestMapping.ImportTarget.Sound, null, CancellationToken.None));
        Assert.Null(await h.Resolver.ResolveAsync(StoreManifestMapping.ImportTarget.Sound, "   ", CancellationToken.None));
        Assert.Null(await h.Resolver.ResolveAsync(StoreManifestMapping.ImportTarget.Unsupported, "UI", CancellationToken.None));

        h.GetSound.Verify(q => q.Handle(It.IsAny<GetAllSoundCategoriesQuery>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Resolve_TextureSetCategories_UseTheModelSpecificVocabulary()
    {
        var h = new Harness();
        h.GetTextureSet
            .Setup(q => q.Handle(It.Is<GetAllTextureSetCategoriesQuery>(x => x.Kind == TextureSetKind.ModelSpecific), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(new GetAllTextureSetCategoriesResponse(Array.Empty<TextureSetCategorySummaryDto>())));
        h.CreateTextureSet
            .Setup(c => c.Handle(It.Is<CreateTextureSetCategoryCommand>(cmd => cmd.Kind == TextureSetKind.ModelSpecific), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(new TextureSetCategorySummaryDto { Id = 12, Name = "Wood" }));

        Assert.Equal(12, await h.Resolver.ResolveAsync(StoreManifestMapping.ImportTarget.TextureSet, "Wood", CancellationToken.None));
    }

    private sealed class Harness
    {
        public readonly Mock<IQueryHandler<GetAllModelCategoriesQuery, GetAllModelCategoriesResponse>> GetModel = new();
        public readonly Mock<IQueryHandler<GetAllTextureSetCategoriesQuery, GetAllTextureSetCategoriesResponse>> GetTextureSet = new();
        public readonly Mock<IQueryHandler<GetAllSoundCategoriesQuery, GetAllSoundCategoriesResponse>> GetSound = new();
        public readonly Mock<IQueryHandler<GetAllSpriteCategoriesQuery, GetAllSpriteCategoriesResponse>> GetSprite = new();
        public readonly Mock<IQueryHandler<GetAllEnvironmentMapCategoriesQuery, GetAllEnvironmentMapCategoriesResponse>> GetEnvMap = new();
        public readonly Mock<ICommandHandler<CreateModelCategoryCommand, ModelCategorySummaryDto>> CreateModel = new();
        public readonly Mock<ICommandHandler<CreateTextureSetCategoryCommand, TextureSetCategorySummaryDto>> CreateTextureSet = new();
        public readonly Mock<ICommandHandler<CreateSoundCategoryCommand, SoundCategorySummaryDto>> CreateSound = new();
        public readonly Mock<ICommandHandler<CreateSpriteCategoryCommand, SpriteCategorySummaryDto>> CreateSprite = new();
        public readonly Mock<ICommandHandler<CreateEnvironmentMapCategoryCommand, EnvironmentMapCategorySummaryDto>> CreateEnvMap = new();

        public readonly IStoreImportCategoryResolver Resolver;

        public Harness()
        {
            Resolver = new StoreImportCategoryResolver(
                GetModel.Object, GetTextureSet.Object, GetSound.Object, GetSprite.Object, GetEnvMap.Object,
                CreateModel.Object, CreateTextureSet.Object, CreateSound.Object, CreateSprite.Object, CreateEnvMap.Object,
                NullLogger<StoreImportCategoryResolver>.Instance);
        }

        public void SetSoundCategories(params SoundCategorySummaryDto[] categories)
            => GetSound
                .Setup(q => q.Handle(It.IsAny<GetAllSoundCategoriesQuery>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync(Result.Success(new GetAllSoundCategoriesResponse(categories)));

        public void SetSpriteCategories(params SpriteCategorySummaryDto[] categories)
            => GetSprite
                .Setup(q => q.Handle(It.IsAny<GetAllSpriteCategoriesQuery>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync(Result.Success(new GetAllSpriteCategoriesResponse(categories)));
    }
}
