using System.Text;
using Application.Abstractions;
using Application.Abstractions.Files;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Models;
using Application.Services;
using Domain.Models;
using Domain.Services;
using Domain.ValueObjects;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using SharedKernel;
using Xunit;
using DomainFile = Domain.Models.File;

namespace Application.Tests.Models;

/// <summary>
/// The multi-file import's own logic: what counts as the same asset. A loose
/// <c>.gltf</c> is identity-incomplete — the primary file's hash does not describe the
/// geometry, the referenced <c>.bin</c> does.
/// </summary>
public class ImportModelWithAuxiliaryFilesCommandHandlerTests
{
    private static readonly DateTime Now = new(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);

    private readonly Mock<ICommandHandler<AddModelCommand, AddModelCommandResponse>> _addModel = new();
    private readonly Mock<IModelRepository> _models = new();
    private readonly Mock<IFileCreationService> _files = new();
    private readonly Mock<IModelVersionAuxiliaryFileRepository> _auxiliaries = new();
    private readonly Mock<IUnitOfWork> _uow = new();
    private readonly ImportModelWithAuxiliaryFilesCommandHandler _handler;

    public ImportModelWithAuxiliaryFilesCommandHandlerTests()
    {
        var clock = new Mock<IDateTimeProvider>();
        clock.Setup(c => c.UtcNow).Returns(Now);
        _handler = new ImportModelWithAuxiliaryFilesCommandHandler(
            _addModel.Object, _models.Object, _files.Object, _auxiliaries.Object,
            clock.Object, _uow.Object,
            NullLogger<ImportModelWithAuxiliaryFilesCommandHandler>.Instance);
    }

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

    private static DomainFile FileWithHash(int id, string name, string hash) =>
        DomainFile.Create(
            name, name, $"/store/{name}", "application/octet-stream",
            FileType.ValidateForUpload(name).Value, 10, hash, Now).WithId(id);

    /// <summary>A model whose active version has the given id.</summary>
    private static Model ModelWithActiveVersion(int modelId, int versionId)
    {
        var model = Model.Create($"Model {modelId}", Now).WithId(modelId);
        var version = ModelVersion.Create(modelId, 1, "v1", Now).WithId(versionId);
        typeof(Model).GetProperty(nameof(Model.ActiveVersion))!.SetValue(model, version);
        typeof(Model).GetProperty(nameof(Model.ActiveVersionId))!.SetValue(model, versionId);
        return model;
    }

    private void SetupAddModel(int modelId, int versionId, bool alreadyExists, bool skipDedup = false)
    {
        _addModel
            .Setup(h => h.Handle(
                It.Is<AddModelCommand>(c => c.SkipDeduplication == skipDedup),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(new AddModelCommandResponse(modelId, alreadyExists)));
        _models
            .Setup(r => r.GetByIdAsync(modelId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(ModelWithActiveVersion(modelId, versionId));
    }

    private void SetupAuxiliaryFile(string name, int fileId, string hash)
    {
        _files
            .Setup(f => f.CreateOrGetExistingFileAsync(
                It.Is<IFileUpload>(u => u.FileName == name), It.IsAny<FileType>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(FileWithHash(fileId, name, hash)));
    }

    private static ImportModelWithAuxiliaryFilesCommand Command() => new(
        new FakeUpload("scene.gltf"),
        new[] { new AuxiliaryUpload("scene.bin", new FakeUpload("scene.bin")) });

    [Fact]
    public async Task Links_Auxiliaries_To_A_Newly_Created_Model()
    {
        SetupAddModel(modelId: 7, versionId: 70, alreadyExists: false);
        SetupAuxiliaryFile("scene.bin", fileId: 100, hash: new string('a', 64));

        var result = await _handler.Handle(Command(), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(7, result.Value.Id);
        Assert.Equal(1, result.Value.AuxiliaryFilesLinked);
        _auxiliaries.Verify(
            r => r.AddAsync(It.Is<ModelVersionAuxiliaryFile>(a => a.ModelVersionId == 70), It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task Reuses_The_Existing_Model_When_The_Referenced_Resources_Match()
    {
        // Same .gltf, same .bin — genuinely the same asset. Must not fork a duplicate.
        var binHash = "b" + new string('0', 63);
        SetupAddModel(modelId: 7, versionId: 70, alreadyExists: true);
        SetupAuxiliaryFile("scene.bin", fileId: 100, hash: binHash);
        _auxiliaries
            .Setup(r => r.GetForVersionAsync(70, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { ExistingLink(70, FileWithHash(100, "scene.bin", binHash)) });
        _auxiliaries
            .Setup(r => r.ExistsAsync(70, "scene.bin", It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

        var result = await _handler.Handle(Command(), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(7, result.Value.Id);
        Assert.True(result.Value.AlreadyExists);
        _addModel.Verify(
            h => h.Handle(It.Is<AddModelCommand>(c => c.SkipDeduplication), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task Imports_A_Separate_Model_When_The_Same_Gltf_References_Different_Buffers()
    {
        // Regression: dedup ran on the primary .gltf hash alone, and the second import
        // then SKIPPED its own scene.bin because a link at that path already existed.
        // Two different assets collapsed into one and the second's geometry was lost.
        var existingHash = "b" + new string('0', 63);
        var incomingHash = "c" + new string('0', 63);

        SetupAddModel(modelId: 7, versionId: 70, alreadyExists: true);
        SetupAddModel(modelId: 8, versionId: 80, alreadyExists: false, skipDedup: true);
        SetupAuxiliaryFile("scene.bin", fileId: 101, hash: incomingHash);
        _auxiliaries
            .Setup(r => r.GetForVersionAsync(70, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { ExistingLink(70, FileWithHash(100, "scene.bin", existingHash)) });

        var result = await _handler.Handle(Command(), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(8, result.Value.Id);
        Assert.False(result.Value.AlreadyExists);
        Assert.Equal(1, result.Value.AuxiliaryFilesLinked);
        // The new model's own version carries the incoming buffer.
        _auxiliaries.Verify(
            r => r.AddAsync(
                It.Is<ModelVersionAuxiliaryFile>(a => a.ModelVersionId == 80 && a.RelativePath == "scene.bin"),
                It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task Adds_Missing_Resources_To_An_Existing_Model_Without_Forking_It()
    {
        // A path the existing version doesn't have yet is additive, not a conflict.
        SetupAddModel(modelId: 7, versionId: 70, alreadyExists: true);
        SetupAuxiliaryFile("scene.bin", fileId: 100, hash: new string('a', 64));
        _auxiliaries
            .Setup(r => r.GetForVersionAsync(70, It.IsAny<CancellationToken>()))
            .ReturnsAsync(Array.Empty<ModelVersionAuxiliaryFile>());

        var result = await _handler.Handle(Command(), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(7, result.Value.Id);
        Assert.Equal(1, result.Value.AuxiliaryFilesLinked);
        _addModel.Verify(
            h => h.Handle(It.Is<AddModelCommand>(c => c.SkipDeduplication), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    private static ModelVersionAuxiliaryFile ExistingLink(int versionId, DomainFile file)
    {
        var link = ModelVersionAuxiliaryFile.Create(versionId, file, "scene.bin", Now);
        link.File = file;
        return link;
    }
}
