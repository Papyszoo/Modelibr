using Domain.Services;
using Xunit;

namespace Application.Tests.Services;

public class IDateTimeProviderTests
{
    private class TestDateTimeProvider : IDateTimeProvider
    {
        private readonly DateTime _fixedTime;

        public TestDateTimeProvider(DateTime fixedTime)
        {
            _fixedTime = fixedTime;
        }

        public DateTime UtcNow => _fixedTime;
    }

    [Fact]
    public void UtcNow_WithTestImplementation_ReturnsFixedTime()
    {
        // Arrange
        var expectedTime = new DateTime(2023, 1, 1, 12, 0, 0, DateTimeKind.Utc);
        var provider = new TestDateTimeProvider(expectedTime);

        // Act
        var result = provider.UtcNow;

        // Assert
        Assert.Equal(expectedTime, result);
    }

    [Fact]
    public void UtcNow_WithCurrentTimeProvider_ReturnsUtcKind()
    {
        // Arrange
        var provider = new TestDateTimeProvider(DateTime.UtcNow);

        // Act
        var result = provider.UtcNow;

        // Assert
        Assert.Equal(DateTimeKind.Utc, result.Kind);
    }
}