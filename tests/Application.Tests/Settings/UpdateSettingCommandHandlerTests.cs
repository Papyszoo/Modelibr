using Application.Abstractions.Repositories;
using Application.Settings;
using Domain.Models;
using Domain.Services;
using Moq;
using SharedKernel;
using Xunit;

namespace Application.Tests.Settings;

public class UpdateSettingCommandHandlerTests
{
    private readonly Mock<ISettingRepository> _settingRepositoryMock;
    private readonly Mock<IDateTimeProvider> _dateTimeProviderMock;
    private readonly UpdateSettingCommandHandler _handler;
    private readonly DateTime _fixedTime = new(2023, 1, 1, 12, 0, 0, DateTimeKind.Utc);

    public UpdateSettingCommandHandlerTests()
    {
        _settingRepositoryMock = new Mock<ISettingRepository>();
        _dateTimeProviderMock = new Mock<IDateTimeProvider>();
        _dateTimeProviderMock.Setup(x => x.UtcNow).Returns(_fixedTime);
        
        _handler = new UpdateSettingCommandHandler(
            _settingRepositoryMock.Object,
            _dateTimeProviderMock.Object);
    }

    [Fact]
    public async Task Handle_WithNewSetting_CreatesNewSetting()
    {
        // Arrange
        var command = new UpdateSettingCommand("TestKey", "TestValue");
        _settingRepositoryMock
            .Setup(x => x.GetByKeyAsync("TestKey", It.IsAny<CancellationToken>()))
            .ReturnsAsync((Setting?)null);
        
        Setting? addedSetting = null;
        _settingRepositoryMock
            .Setup(x => x.AddAsync(It.IsAny<Setting>(), It.IsAny<CancellationToken>()))
            .Callback<Setting, CancellationToken>((s, _) => addedSetting = s)
            .ReturnsAsync((Setting s, CancellationToken _) => s);

        // Act
        var result = await _handler.Handle(command, CancellationToken.None);

        // Assert
        Assert.True(result.IsSuccess);
        Assert.NotNull(addedSetting);
        Assert.Equal("TestKey", addedSetting.Key);
        Assert.Equal("TestValue", addedSetting.Value);
        Assert.Equal(_fixedTime, addedSetting.CreatedAt);
        
        _settingRepositoryMock.Verify(x => x.AddAsync(It.IsAny<Setting>(), It.IsAny<CancellationToken>()), Times.Once);
        _settingRepositoryMock.Verify(x => x.UpdateAsync(It.IsAny<Setting>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Handle_WithExistingSetting_UpdatesSetting()
    {
        // Arrange
        var existingSetting = Setting.Create("TestKey", "OldValue", _fixedTime.AddDays(-1));
        var command = new UpdateSettingCommand("TestKey", "NewValue");
        
        _settingRepositoryMock
            .Setup(x => x.GetByKeyAsync("TestKey", It.IsAny<CancellationToken>()))
            .ReturnsAsync(existingSetting);
        
        _settingRepositoryMock
            .Setup(x => x.UpdateAsync(It.IsAny<Setting>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Setting s, CancellationToken _) => s);

        // Act
        var result = await _handler.Handle(command, CancellationToken.None);

        // Assert
        Assert.True(result.IsSuccess);
        Assert.Equal("NewValue", result.Value.Value);
        Assert.Equal(_fixedTime, result.Value.UpdatedAt);
        
        _settingRepositoryMock.Verify(x => x.UpdateAsync(It.IsAny<Setting>(), It.IsAny<CancellationToken>()), Times.Once);
        _settingRepositoryMock.Verify(x => x.AddAsync(It.IsAny<Setting>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Handle_WithInvalidValue_ReturnsFailure()
    {
        // Arrange
        var command = new UpdateSettingCommand("TestKey", new string('a', 1001)); // Too long
        _settingRepositoryMock
            .Setup(x => x.GetByKeyAsync("TestKey", It.IsAny<CancellationToken>()))
            .ReturnsAsync((Setting?)null);

        // Act
        var result = await _handler.Handle(command, CancellationToken.None);

        // Assert
        Assert.False(result.IsSuccess);
        Assert.Equal("InvalidSetting", result.Error.Code);
    }
}
