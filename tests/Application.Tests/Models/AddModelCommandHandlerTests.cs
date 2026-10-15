using System.Text;
using Application.Abstractions;
using Application.Abstractions.Files;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Models;
using Application.Services;
using Domain.Models;
using Domain.Services;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using SharedKernel;
using Xunit;
using DomainFile = Domain.Models.File;
using FileTypeVO = Domain.ValueObjects.FileType;

namespace Application.Tests.Models;

/// <summary>
/// The creation half of the embedded-materials preset a store import opens on. The
/// preset is seeded while the version is created rather than through
/// <c>SetMainVariantCommand</c>, because that command also queues a thumbnail
/// regeneration - which would replace the store's own thumbnail with a local render the
/// import deliberately avoided.
/// </summary>
public class AddModelCommandHandlerTests
{
    private static readonly DateTime Now = new(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);

    private readonly Mock<IModelRepository> _models = new();
    private readonly Mock<IModelVersionRepository> _versions = new();
    private readonly Mock<IFileCreationService> _files = new();
    private readonly Mock<IBatchUploadRepository> _batches = new();
    private readonly Mock<ISettingRepository> _settings = new();
    private readonly Mock<ICommandHandler<ApplyImportAutomationCommand, ImportAutomationResponse>> _importAutomation = new();
    private readonly Mock<IUnitOfWork> _uow = new();
    private readonly AddModelCommandHandler _handler;

    private ModelVersion? _createdVersion;

    public AddModelCommandHandlerTests()
    {
        var clock = new Mock<IDateTimeProvider>();
        clock.SetupGet(c => c.UtcNow).Returns(Now);

        _handler = new AddModelCommandHandler(
            _models.Object, _versions.Object, _files.Object, clock.Object,
            _batches.Object, _settings.Object, _importAutomation.Object,
            NullLogger<AddModelCommandHandler>.Instance, _uow.Object);
    }

    private void SetupNewModel()
    {
        var file = DomainFile.Create(
            "chair.glb", "chair.glb", "/uploads/chair.glb", "application/octet-stream",
            FileTypeVO.ValidateForModelUpload("chair.glb").Value, 10, new string('a', 64), Now)
            .WithId(30);

        _files
            .Setup(f => f.CreateOrGetExistingFileAsync(
                It.IsAny<IFileUpload>(), It.IsAny<FileTypeVO>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(file));
        _models
            .Setup(r => r.GetByFileHashAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Model?)null);
        _models
            .Setup(r => r.AddAsync(It.IsAny<Model>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Model model, CancellationToken _) => model.WithId(7));
        _versions
            .Setup(r => r.AddAsync(It.IsAny<ModelVersion>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((ModelVersion version, CancellationToken _) =>
            {
                // The real repository returns the row with its database-assigned id,
                // which the next write (File.SetModelVersion) validates.
                _createdVersion = version.WithId(70);
                return _createdVersion;
            });
    }

    [Fact]
    public async Task Handle_WithAMainVariantName_SeedsTheVersionWithThatPreset()
    {
        SetupNewModel();

        var result = await _handler.Handle(
            new AddModelCommand(
                new FakeUpload("chair.glb"),
                "Chair",
                AutoAssignMetadata: false,
                MainVariantName: "__embedded__"),
            CancellationToken.None);

        Assert.True(result.IsSuccess, result.Error?.Message);
        Assert.NotNull(_createdVersion);
        Assert.Contains("__embedded__", _createdVersion!.GetVariantNames());
        Assert.Equal("__embedded__", _createdVersion.MainVariantName);
    }

    [Fact]
    public async Task Handle_WithoutAMainVariantName_LeavesTheVersionWithNoMainVariant()
    {
        // The ordinary upload keeps its old shape: no main variant, so the viewer's
        // "Default" preset is the one in use.
        SetupNewModel();

        var result = await _handler.Handle(
            new AddModelCommand(
                new FakeUpload("chair.glb"), "Chair", AutoAssignMetadata: false),
            CancellationToken.None);

        Assert.True(result.IsSuccess, result.Error?.Message);
        Assert.NotNull(_createdVersion);
        Assert.Null(_createdVersion!.MainVariantName);
        Assert.Empty(_createdVersion.GetVariantNames());
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
}
