using Application.Abstractions.Files;
using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Application.Models;
using Application.Services;
using Domain.Models;
using Domain.Services;
using Domain.ValueObjects;
using Moq;
using SharedKernel;
using Xunit;
using DomainFile = Domain.Models.File;

namespace Application.Tests.Models;

public class CreateModelFromBlendCommandHandlerTests
{
    private readonly Mock<IModelRepository> _mockModelRepository;
    private readonly Mock<IModelVersionRepository> _mockVersionRepository;
    private readonly Mock<IFileCreationService> _mockFileCreationService;
    private readonly Mock<IDateTimeProvider> _mockDateTimeProvider;
    private readonly Mock<IDomainEventDispatcher> _mockEventDispatcher;
    private readonly CreateModelFromBlendCommandHandler _handler;

    public CreateModelFromBlendCommandHandlerTests()
    {
        _mockModelRepository = new Mock<IModelRepository>();
        _mockVersionRepository = new Mock<IModelVersionRepository>();
        _mockFileCreationService = new Mock<IFileCreationService>();
        _mockDateTimeProvider = new Mock<IDateTimeProvider>();
        _mockEventDispatcher = new Mock<IDomainEventDispatcher>();

        _handler = new CreateModelFromBlendCommandHandler(
            _mockModelRepository.Object,
            _mockVersionRepository.Object,
            _mockFileCreationService.Object,
            _mockDateTimeProvider.Object,
            _mockEventDispatcher.Object);
    }

    private static IFileUpload CreateFakeBlendUpload(string fileName = "MyModel.blend")
    {
        var data = new byte[] { 0x42, 0x4C, 0x45, 0x4E, 0x44, 0x45, 0x52 }; // "BLENDER"
        var mock = new Mock<IFileUpload>();
        mock.Setup(f => f.FileName).Returns(fileName);
        mock.Setup(f => f.ContentType).Returns("application/octet-stream");
        mock.Setup(f => f.Length).Returns(data.Length);
        mock.Setup(f => f.OpenRead()).Returns(new MemoryStream(data, writable: false));
        mock.Setup(f => f.CopyToAsync(It.IsAny<Stream>(), It.IsAny<CancellationToken>()))
            .Returns<Stream, CancellationToken>((s, ct) => s.WriteAsync(data, 0, data.Length, ct));
        return mock.Object;
    }

    [Fact]
    public async Task Handle_WithValidBlendFile_CreatesModelAndVersion()
    {
        // Arrange
        var now = DateTime.UtcNow;
        _mockDateTimeProvider.Setup(x => x.UtcNow).Returns(now);

        var fileUpload = CreateFakeBlendUpload("TestModel.blend");
        var command = new CreateModelFromBlendCommand("TestModel", fileUpload);

        var hash = "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
        var fileEntity = DomainFile.Create(
            "TestModel.blend", "TestModel.blend", "/uploads/ab/cd/" + hash,
            "application/octet-stream", FileType.Blend, 7, hash, now);
        typeof(DomainFile).GetProperty("Id")!.SetValue(fileEntity, 1);

        _mockFileCreationService
            .Setup(x => x.CreateOrGetExistingFileAsync(fileUpload, It.IsAny<FileType>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(fileEntity));

        _mockModelRepository
            .Setup(x => x.GetByFileHashAsync(hash, It.IsAny<CancellationToken>()))
            .ReturnsAsync((Model?)null);

        _mockModelRepository
            .Setup(x => x.AddAsync(It.IsAny<Model>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Model m, CancellationToken _) =>
            {
                typeof(Model).GetProperty("Id")!.SetValue(m, 42);
                return m;
            });

        _mockVersionRepository
            .Setup(x => x.AddAsync(It.IsAny<ModelVersion>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((ModelVersion v, CancellationToken _) =>
            {
                typeof(ModelVersion).GetProperty("Id")!.SetValue(v, 100);
                return v;
            });

        _mockModelRepository
            .Setup(x => x.UpdateAsync(It.IsAny<Model>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);

        _mockEventDispatcher
            .Setup(x => x.PublishAsync(It.IsAny<IEnumerable<IDomainEvent>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success());

        // Act
        var result = await _handler.Handle(command, CancellationToken.None);

        // Assert
        Assert.True(result.IsSuccess);
        Assert.Equal(42, result.Value.ModelId);
        Assert.False(result.Value.AlreadyExists);
        _mockModelRepository.Verify(x => x.AddAsync(It.IsAny<Model>(), It.IsAny<CancellationToken>()), Times.Once);
        _mockVersionRepository.Verify(x => x.AddAsync(It.IsAny<ModelVersion>(), It.IsAny<CancellationToken>()), Times.Once);
        _mockEventDispatcher.Verify(x => x.PublishAsync(It.IsAny<IEnumerable<IDomainEvent>>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_WithDuplicateFile_ReturnsAlreadyExists()
    {
        // Arrange
        var now = DateTime.UtcNow;
        _mockDateTimeProvider.Setup(x => x.UtcNow).Returns(now);

        var fileUpload = CreateFakeBlendUpload("Duplicate.blend");
        var command = new CreateModelFromBlendCommand("Duplicate", fileUpload);

        var hash = "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
        var fileEntity = DomainFile.Create(
            "Duplicate.blend", "Duplicate.blend", "/uploads/ab/cd/" + hash,
            "application/octet-stream", FileType.Blend, 7, hash, now);

        _mockFileCreationService
            .Setup(x => x.CreateOrGetExistingFileAsync(fileUpload, It.IsAny<FileType>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(fileEntity));

        var existingModel = Model.Create("ExistingModel", now);
        typeof(Model).GetProperty("Id")!.SetValue(existingModel, 10);

        _mockModelRepository
            .Setup(x => x.GetByFileHashAsync(hash, It.IsAny<CancellationToken>()))
            .ReturnsAsync(existingModel);

        // Act
        var result = await _handler.Handle(command, CancellationToken.None);

        // Assert
        Assert.True(result.IsSuccess);
        Assert.Equal(10, result.Value.ModelId);
        Assert.True(result.Value.AlreadyExists);
        _mockModelRepository.Verify(x => x.AddAsync(It.IsAny<Model>(), It.IsAny<CancellationToken>()), Times.Never);
        _mockVersionRepository.Verify(x => x.AddAsync(It.IsAny<ModelVersion>(), It.IsAny<CancellationToken>()), Times.Never);
        _mockEventDispatcher.Verify(x => x.PublishAsync(It.IsAny<IEnumerable<IDomainEvent>>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Handle_WithInvalidFileType_ReturnsFailure()
    {
        // Arrange
        // A file with no extension fails FileType.FromFileName
        var fileUpload = CreateFakeBlendUpload("");
        var command = new CreateModelFromBlendCommand("BadFile", fileUpload);

        // Act
        var result = await _handler.Handle(command, CancellationToken.None);

        // Assert
        Assert.False(result.IsSuccess);
        _mockFileCreationService.Verify(
            x => x.CreateOrGetExistingFileAsync(It.IsAny<IFileUpload>(), It.IsAny<FileType>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task Handle_WhenFileCreationFails_ReturnsFailure()
    {
        // Arrange
        var fileUpload = CreateFakeBlendUpload("model.blend");
        var command = new CreateModelFromBlendCommand("model", fileUpload);

        _mockFileCreationService
            .Setup(x => x.CreateOrGetExistingFileAsync(fileUpload, It.IsAny<FileType>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Failure<DomainFile>(new Error("StorageFull", "Storage is full")));

        // Act
        var result = await _handler.Handle(command, CancellationToken.None);

        // Assert
        Assert.False(result.IsSuccess);
        Assert.Equal("StorageFull", result.Error.Code);
        _mockModelRepository.Verify(x => x.AddAsync(It.IsAny<Model>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Handle_DispatchesModelUploadedEvent()
    {
        // Arrange  
        var now = DateTime.UtcNow;
        _mockDateTimeProvider.Setup(x => x.UtcNow).Returns(now);

        var fileUpload = CreateFakeBlendUpload("BlendModel.blend");
        var command = new CreateModelFromBlendCommand("BlendModel", fileUpload);

        var hash = "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
        var fileEntity = DomainFile.Create(
            "BlendModel.blend", "BlendModel.blend", "/uploads/ab/cd/" + hash,
            "application/octet-stream", FileType.Blend, 7, hash, now);
        typeof(DomainFile).GetProperty("Id")!.SetValue(fileEntity, 5);

        _mockFileCreationService
            .Setup(x => x.CreateOrGetExistingFileAsync(It.IsAny<IFileUpload>(), It.IsAny<FileType>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(fileEntity));

        _mockModelRepository
            .Setup(x => x.GetByFileHashAsync(hash, It.IsAny<CancellationToken>()))
            .ReturnsAsync((Model?)null);

        _mockModelRepository
            .Setup(x => x.AddAsync(It.IsAny<Model>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Model m, CancellationToken _) =>
            {
                typeof(Model).GetProperty("Id")!.SetValue(m, 1);
                return m;
            });

        _mockVersionRepository
            .Setup(x => x.AddAsync(It.IsAny<ModelVersion>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((ModelVersion v, CancellationToken _) =>
            {
                typeof(ModelVersion).GetProperty("Id")!.SetValue(v, 1);
                return v;
            });

        _mockModelRepository
            .Setup(x => x.UpdateAsync(It.IsAny<Model>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);

        IEnumerable<IDomainEvent>? publishedEvents = null;
        _mockEventDispatcher
            .Setup(x => x.PublishAsync(It.IsAny<IEnumerable<IDomainEvent>>(), It.IsAny<CancellationToken>()))
            .Callback<IEnumerable<IDomainEvent>, CancellationToken>((events, _) => publishedEvents = events.ToList())
            .ReturnsAsync(Result.Success());

        // Act
        var result = await _handler.Handle(command, CancellationToken.None);

        // Assert
        Assert.True(result.IsSuccess);
        Assert.NotNull(publishedEvents);
        Assert.NotEmpty(publishedEvents);
    }

    [Fact]
    public void Handle_BlendFilePassesValidateForUpload()
    {
        // Verify that .blend files pass FileType.ValidateForUpload (which accepts all known types)
        var validationResult = FileType.ValidateForUpload("test.blend");
        Assert.True(validationResult.IsSuccess);
        Assert.Equal(FileType.Blend, validationResult.Value);
    }
}
