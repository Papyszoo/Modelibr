using System.Text;
using Application.Abstractions.Files;
using Application.Abstractions.Messaging;
using Application.Models;
using Application.StoreImports;
using Moq;
using SharedKernel;
using Xunit;

namespace Application.Tests.StoreImports;

/// <summary>
/// What a store model is created as. A store item arrives dressed - its materials are
/// inside the file, and the import reuses the store's own thumbnail, which is that asset
/// rendered with them. The version therefore opens on the embedded-materials preset;
/// without it the viewer's "Default" preset replaces every material with the clay
/// stand-in and the model opens looking nothing like its own card.
/// </summary>
public class StoreImportSinkModelTests
{
    [Fact]
    public async Task CreateModel_SeedsTheEmbeddedMaterialsPreset()
    {
        AddModelCommand? captured = null;
        var addModel = new Mock<ICommandHandler<AddModelCommand, AddModelCommandResponse>>();
        addModel
            .Setup(h => h.Handle(It.IsAny<AddModelCommand>(), It.IsAny<CancellationToken>()))
            .Callback<AddModelCommand, CancellationToken>((command, _) => captured = command)
            .ReturnsAsync(Result.Success(new AddModelCommandResponse(101, false, "sha", 7)));

        var sink = BuildSink(addModel.Object);

        var modelId = await sink.CreateModelAsync(
            new FakeUpload("chair.glb"), "Chair", null,
            generateThumbnail: false, CancellationToken.None);

        Assert.Equal(101, modelId);
        Assert.NotNull(captured);
        Assert.Equal("__embedded__", captured!.MainVariantName);
        // The other store defaults stay: the manifest supplies the metadata and the
        // store thumbnail, so neither classification nor a local render is asked for.
        Assert.False(captured.AutoAssignMetadata);
        Assert.False(captured.GenerateThumbnail);
    }

    // Only the AddModel handler is exercised here; the sink's other collaborators are
    // never touched on this path, so they stay unset.
    private static StoreImportSink BuildSink(
        ICommandHandler<AddModelCommand, AddModelCommandResponse> addModel)
        => new(
            null!, null!, null!, addModel, null!, null!, null!, null!, null!, null!,
            null!, null!, null!, null!, null!, null!, null!, null!, null!, null!,
            null!, null!, null!, null!, null!, null!, null!, null!, null!);

    private sealed class FakeUpload : IFileUpload
    {
        private readonly byte[] _bytes;
        public FakeUpload(string fileName, string content = "x")
        {
            FileName = fileName;
            _bytes = Encoding.UTF8.GetBytes(content);
        }
        public string FileName { get; }
        public string ContentType => "application/octet-stream";
        public long Length => _bytes.Length;
        public Stream OpenRead() => new MemoryStream(_bytes);
        public Task CopyToAsync(Stream target, CancellationToken cancellationToken = default) =>
            target.WriteAsync(_bytes, cancellationToken).AsTask();
    }
}
