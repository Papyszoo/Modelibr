using Application.Abstractions.Repositories;
using Application.Settings;
using Domain.Models;
using Moq;
using Xunit;

namespace Application.Tests.Settings;

public class GetAllSettingsQueryHandlerTests
{
    private readonly Mock<ISettingRepository> _settingRepositoryMock;
    private readonly GetAllSettingsQueryHandler _handler;

    public GetAllSettingsQueryHandlerTests()
    {
        _settingRepositoryMock = new Mock<ISettingRepository>();
        _handler = new GetAllSettingsQueryHandler(_settingRepositoryMock.Object);
    }

    [Fact]
    public async Task Handle_WithExistingSettings_ReturnsAllSettings()
    {
        // Arrange
        var createdAt = DateTime.UtcNow;
        var settings = new List<Setting>
        {
            Setting.Create("Key1", "Value1", createdAt, "Description 1"),
            Setting.Create("Key2", "Value2", createdAt, "Description 2"),
            Setting.Create("Key3", "Value3", createdAt)
        };

        _settingRepositoryMock
            .Setup(x => x.GetAllAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(settings);

        // Act
        var result = await _handler.Handle(new GetAllSettingsQuery(), CancellationToken.None);

        // Assert
        Assert.True(result.IsSuccess);
        Assert.Equal(3, result.Value.Settings.Count);
        
        var setting1 = result.Value.Settings[0];
        Assert.Equal("Key1", setting1.Key);
        Assert.Equal("Value1", setting1.Value);
        Assert.Equal("Description 1", setting1.Description);
        
        var setting3 = result.Value.Settings[2];
        Assert.Equal("Key3", setting3.Key);
        Assert.Null(setting3.Description);
    }

    [Fact]
    public async Task Handle_WithNoSettings_ReturnsEmptyList()
    {
        // Arrange
        _settingRepositoryMock
            .Setup(x => x.GetAllAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<Setting>());

        // Act
        var result = await _handler.Handle(new GetAllSettingsQuery(), CancellationToken.None);

        // Assert
        Assert.True(result.IsSuccess);
        Assert.Empty(result.Value.Settings);
    }
}
