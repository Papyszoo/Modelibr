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
        // "UI" exists but only as a child — imports target root-level taxonomy names.
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
    }
}
