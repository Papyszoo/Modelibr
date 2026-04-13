using Application.Abstractions.Repositories;
using Application.EnvironmentMaps;
using Application.Tests;
using Domain.Models;
using Domain.ValueObjects;
using Moq;
using System.Reflection;
using Xunit;
using DomainFile = Domain.Models.File;

namespace Application.Tests.EnvironmentMaps;

public class EnvironmentMapQueryHandlerTests
{
    private readonly Mock<IEnvironmentMapRepository> _environmentMapRepository = new();

    [Fact]
    public async Task GetById_WhenEnvironmentMapHasCubeVariant_MapsCubeFacesAndPreviewUrls()
    {
        var now = DateTime.UtcNow;
        var environmentMap = EnvironmentMap.Create("Studio", now).WithId(5);
        var customThumbnail = CreateFile("thumb.png", FileType.Texture, now).WithId(40);
        var parentCategory = EnvironmentMapCategory.Create("Lighting", null, null, now).WithId(100);
        var childCategory = EnvironmentMapCategory.Create("Studio", null, parentCategory.Id, now).WithId(101);
        SetParent(childCategory, parentCategory);
        SetModelCategory(environmentMap, childCategory);
        environmentMap.AssignCategory(childCategory.Id, now);
        environmentMap.SetCustomThumbnail(customThumbnail, now);

        var cubeVariant = EnvironmentMapVariant.CreateCube(
            new Dictionary<EnvironmentMapCubeFace, DomainFile>
            {
                [EnvironmentMapCubeFace.Px] = CreateFile("px.hdr", FileType.Hdr, now).WithId(11),
                [EnvironmentMapCubeFace.Nx] = CreateFile("nx.hdr", FileType.Hdr, now).WithId(12),
                [EnvironmentMapCubeFace.Py] = CreateFile("py.hdr", FileType.Hdr, now).WithId(13),
                [EnvironmentMapCubeFace.Ny] = CreateFile("ny.hdr", FileType.Hdr, now).WithId(14),
                [EnvironmentMapCubeFace.Pz] = CreateFile("pz.hdr", FileType.Hdr, now).WithId(15),
                [EnvironmentMapCubeFace.Nz] = CreateFile("nz.hdr", FileType.Hdr, now).WithId(16)
            },
            "2K",
            now).WithId(25);

        environmentMap.AddVariant(cubeVariant, now);
        environmentMap.SetPreviewVariant(cubeVariant.Id, now);

        _environmentMapRepository
            .Setup(x => x.GetByIdAsync(environmentMap.Id, It.IsAny<CancellationToken>()))
            .ReturnsAsync(environmentMap);

        var handler = new GetEnvironmentMapByIdQueryHandler(_environmentMapRepository.Object);

        var result = await handler.Handle(new GetEnvironmentMapByIdQuery(environmentMap.Id), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal($"/environment-maps/{environmentMap.Id}/preview?v={environmentMap.UpdatedAt.Ticks}", result.Value.EnvironmentMap.PreviewUrl);
        Assert.Equal($"/files/{customThumbnail.Id}/preview?channel=rgb", result.Value.EnvironmentMap.CustomThumbnailUrl);
        Assert.NotNull(result.Value.EnvironmentMap.Category);
        Assert.Equal("Lighting / Studio", result.Value.EnvironmentMap.Category!.Path);
        Assert.NotNull(result.Value.EnvironmentMap.CubeFaces);

        var variant = Assert.Single(result.Value.EnvironmentMap.Variants);
        Assert.Equal("cube", variant.SourceType);
        Assert.Equal("cube", variant.ProjectionType);
        Assert.Equal($"/environment-maps/{environmentMap.Id}/variants/{cubeVariant.Id}/preview?v={environmentMap.UpdatedAt.Ticks}", variant.PreviewUrl);
        Assert.Equal(15, variant.PreviewFileId);
        Assert.Null(variant.FileId);
        Assert.Equal("Cube map", variant.FileName);
        Assert.NotNull(variant.CubeFaces);
        Assert.Equal(11, variant.CubeFaces!.Px.FileId);
        Assert.Equal(16, variant.CubeFaces.Nz.FileId);
    }

    [Fact]
    public async Task GetById_WhenEnvironmentMapHasCustomPixelAndStandardVariants_OrdersByResolvedSize()
    {
        var now = DateTime.UtcNow;
        var environmentMap = EnvironmentMap.Create("Sky", now).WithId(9);

        var standardVariant = EnvironmentMapVariant.Create(CreateFile("sky-4k.hdr", FileType.Hdr, now).WithId(51), "4K", now).WithId(61);
        var customVariant = EnvironmentMapVariant.Create(CreateFile("sky-6144.hdr", FileType.Hdr, now).WithId(52), "6144px", now).WithId(62);

        environmentMap.AddVariant(standardVariant, now);
        environmentMap.AddVariant(customVariant, now);

        _environmentMapRepository
            .Setup(x => x.GetByIdAsync(environmentMap.Id, It.IsAny<CancellationToken>()))
            .ReturnsAsync(environmentMap);

        var handler = new GetEnvironmentMapByIdQueryHandler(_environmentMapRepository.Object);

        var result = await handler.Handle(new GetEnvironmentMapByIdQuery(environmentMap.Id), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Collection(
            result.Value.EnvironmentMap.Variants,
            variant => Assert.Equal("6144px", variant.SizeLabel),
            variant => Assert.Equal("4K", variant.SizeLabel));
    }

    [Fact]
    public async Task GetAll_WhenEnvironmentMapHasPreviewVariantAndContainers_MapsPreviewSizeAndMembership()
    {
        var now = DateTime.UtcNow;
        var environmentMap = EnvironmentMap.Create("Atrium", now).WithId(17);
        var previewVariant = EnvironmentMapVariant.Create(CreateFile("atrium-4k.hdr", FileType.Hdr, now).WithId(71), "4K", now).WithId(81);
        var secondaryVariant = EnvironmentMapVariant.Create(CreateFile("atrium-2k.hdr", FileType.Hdr, now).WithId(72), "2K", now).WithId(82);
        var categoryRoot = EnvironmentMapCategory.Create("Interiors", null, null, now).WithId(201);
        var categoryLeaf = EnvironmentMapCategory.Create("Atriums", null, categoryRoot.Id, now).WithId(202);
        SetParent(categoryLeaf, categoryRoot);

        environmentMap.AddVariant(previewVariant, now);
        environmentMap.AddVariant(secondaryVariant, now);
        environmentMap.SetPreviewVariant(previewVariant.Id, now);
        SetModelCategory(environmentMap, categoryLeaf);
        environmentMap.AssignCategory(categoryLeaf.Id, now);

        var pack = Pack.Create("Lighting", "Studio pack", null, null, now).WithId(3);
        var project = Project.Create("Lobby", "Archviz", null, now).WithId(6);
        pack.EnvironmentMaps.Add(environmentMap);
        project.EnvironmentMaps.Add(environmentMap);
        environmentMap.Packs.Add(pack);
        environmentMap.Projects.Add(project);

        _environmentMapRepository
            .Setup(x => x.GetAllAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync([environmentMap]);

        var handler = new GetAllEnvironmentMapsQueryHandler(_environmentMapRepository.Object);

        var result = await handler.Handle(new GetAllEnvironmentMapsQuery(), CancellationToken.None);

        Assert.True(result.IsSuccess);
        var item = Assert.Single(result.Value.EnvironmentMaps);
        Assert.Equal("4K", item.PreviewSizeLabel);
        Assert.Equal("Interiors / Atriums", item.CategoryPath);
        Assert.Equal(new[] { "4K", "2K" }, item.SizeLabels);
        Assert.Equal(new[] { "single" }, item.SourceTypes);
        Assert.Equal(new[] { "equirectangular" }, item.ProjectionTypes);
        Assert.Single(item.Packs);
        Assert.Equal("Lighting", item.Packs.First().Name);
        Assert.Single(item.Projects);
        Assert.Equal("Lobby", item.Projects.First().Name);
    }

    private static void SetModelCategory(EnvironmentMap environmentMap, EnvironmentMapCategory category)
    {
        typeof(EnvironmentMap)
            .GetProperty(nameof(EnvironmentMap.EnvironmentMapCategory), BindingFlags.Public | BindingFlags.Instance)!
            .SetValue(environmentMap, category);
    }

    private static void SetParent(EnvironmentMapCategory category, EnvironmentMapCategory parent)
    {
        typeof(EnvironmentMapCategory)
            .GetProperty(nameof(EnvironmentMapCategory.Parent), BindingFlags.Public | BindingFlags.Instance)!
            .SetValue(category, parent);
    }

    private static DomainFile CreateFile(string fileName, FileType fileType, DateTime createdAt)
    {
        return DomainFile.Create(
            fileName,
            fileName,
            $"/uploads/{fileName}",
            fileType.GetMimeType(),
            fileType,
            1024,
            $"{Guid.NewGuid():N}{Guid.NewGuid():N}"[..64],
            createdAt);
    }
}
