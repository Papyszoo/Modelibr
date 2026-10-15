using Application.Abstractions;
using Application.Abstractions.Files;
using Application.Abstractions.Repositories;
using Application.Abstractions.Storage;
using Application.Tests;
using Application.Thumbnails;
using Domain.Models;
using Domain.Services;
using Domain.ValueObjects;
using Moq;
using Xunit;
using DomainFile = Domain.Models.File;
using StorageFileType = Domain.Files.FileType;

namespace Application.Tests.Thumbnails;

/// <summary>
/// Writers persist the uploads-relative path, like every other stored file, so the
/// library survives a change of uploads root. The old absolute path (uploads root +
/// relative) is what this guards against regressing.
/// </summary>
public class ThumbnailUploadPathTests
{
    private static readonly DateTime Now = new(2026, 10, 10, 12, 0, 0, DateTimeKind.Utc);

    private readonly Mock<IModelRepository> _models = new();
    private readonly Mock<IThumbnailRepository> _thumbnails = new();
    private readonly Mock<IFileStorage> _storage = new();
    private readonly Mock<IDateTimeProvider> _clock = new();
    private readonly Mock<IUnitOfWork> _unitOfWork = new();

    public ThumbnailUploadPathTests()
    {
        _clock.Setup(c => c.UtcNow).Returns(Now);
        _storage
            .Setup(s => s.SaveAsync(It.IsAny<IFileUpload>(), It.IsAny<StorageFileType>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new StoredFileResult("ab/cd/abcdef", "abcdef", new string('a', 64), 1234));
        _thumbnails
            .Setup(r => r.AddAsync(It.IsAny<Thumbnail>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Thumbnail t, CancellationToken _) => t.WithId(5));
    }

    private Model GivenModel()
    {
        var model = Model.Create("M", Now).WithId(1);
        var version = model.CreateVersion("v1", Now).WithId(10);
        version.AddFile(DomainFile.Create(
            "m.obj", "stored.obj", "/path/1", "model/obj", FileType.Obj, 1024, new string('a', 64), Now));
        _models.Setup(r => r.GetByIdAsync(1, It.IsAny<CancellationToken>())).ReturnsAsync(model);
        return model;
    }

    private static IFileUpload Upload(string contentType)
    {
        var file = new Mock<IFileUpload>();
        file.Setup(f => f.ContentType).Returns(contentType);
        return file.Object;
    }

    [Fact]
    public async Task UploadWebp_StoresAndReturnsTheUploadsRelativePath()
    {
        var model = GivenModel();
        var handler = new UploadThumbnailCommandHandler(
            _models.Object, _thumbnails.Object, _storage.Object, _clock.Object, _unitOfWork.Object);

        var result = await handler.Handle(
            new UploadThumbnailCommand(1, 10, Upload("image/webp")), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal("ab/cd/abcdef", result.Value.ThumbnailPath);
        Assert.Equal("ab/cd/abcdef", model.Versions.Single().Thumbnail!.ThumbnailPath);
    }

    [Fact]
    public async Task UploadPng_StoresAndReturnsTheUploadsRelativePath()
    {
        var model = GivenModel();
        var handler = new UploadPngThumbnailCommandHandler(
            _models.Object, _thumbnails.Object, _storage.Object, _clock.Object, _unitOfWork.Object);

        var result = await handler.Handle(
            new UploadPngThumbnailCommand(1, 10, Upload("image/png")), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal("ab/cd/abcdef", result.Value.PngThumbnailPath);
        Assert.Equal("ab/cd/abcdef", model.Versions.Single().Thumbnail!.ThumbnailPath);
    }
}
