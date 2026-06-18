using Application.Abstractions.Files;
using Application.Abstractions.Repositories;
using Application.Scripts;
using Application.Services;
using Domain.Models;
using Domain.Services;
using Domain.ValueObjects;
using Moq;
using SharedKernel;
using Xunit;
using DomainFile = Domain.Models.File;

namespace Application.Tests.Scripts;

public class UpdateScriptContentCommandHandlerTests
{
    private readonly Mock<IScriptRepository> _scriptRepository = new();
    private readonly Mock<IFileCreationService> _fileCreationService = new();
    private readonly Mock<IDateTimeProvider> _dateTimeProvider = new();
    private readonly UpdateScriptContentCommandHandler _handler;

    public UpdateScriptContentCommandHandlerTests()
    {
        _dateTimeProvider.Setup(x => x.UtcNow).Returns(DateTime.UtcNow);
        _handler = new UpdateScriptContentCommandHandler(
            _scriptRepository.Object,
            _fileCreationService.Object,
            _dateTimeProvider.Object);
    }

    [Fact]
    public async Task Handle_WithEditedContent_CreatesNewFileAndRePointsScript()
    {
        // Arrange
        var originalFile = CreateFile("a1b2c3d4567890123456789012345678901234567890123456789012c3d4e5f6");
        var script = Script.Create("player", originalFile, "lua", lineCount: 2, sizeBytes: 10, DateTime.UtcNow);
        _scriptRepository.Setup(r => r.GetByIdAsync(1, It.IsAny<CancellationToken>())).ReturnsAsync(script);

        var newFile = CreateFile("c3d4e5f6789012345678901234567890123456789012345678901234a1b2c3d4");
        _fileCreationService
            .Setup(s => s.CreateOrGetExistingFileAsync(It.IsAny<IFileUpload>(), It.IsAny<FileType>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(newFile));
        _scriptRepository.Setup(r => r.UpdateAsync(It.IsAny<Script>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Script s, CancellationToken _) => s);

        // Act — three lines of new content
        var result = await _handler.Handle(new UpdateScriptContentCommand(1, "local M = {}\nfunction M.run() end\nreturn M"), CancellationToken.None);

        // Assert
        Assert.True(result.IsSuccess);
        Assert.Equal(newFile.Id, result.Value.FileId);
        Assert.Equal(3, result.Value.LineCount);
        Assert.Same(newFile, script.File);
        _fileCreationService.Verify(s => s.CreateOrGetExistingFileAsync(
            It.Is<IFileUpload>(u => u.FileName == "player.lua"), It.IsAny<FileType>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_WhenScriptMissing_ReturnsFailure()
    {
        // Arrange
        _scriptRepository.Setup(r => r.GetByIdAsync(99, It.IsAny<CancellationToken>())).ReturnsAsync((Script?)null);

        // Act
        var result = await _handler.Handle(new UpdateScriptContentCommand(99, "x"), CancellationToken.None);

        // Assert
        Assert.False(result.IsSuccess);
        Assert.Equal("ScriptNotFound", result.Error.Code);
    }

    private static DomainFile CreateFile(string hash) => DomainFile.Create(
        "player.lua",
        "stored_player.lua",
        "/path/to/player.lua",
        "text/plain",
        FileType.Lua,
        1024L,
        hash,
        DateTime.UtcNow);
}
