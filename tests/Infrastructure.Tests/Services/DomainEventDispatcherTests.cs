using Application.Abstractions.Messaging;
using Domain.Events;
using Infrastructure.Services;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Moq;
using SharedKernel;
using Xunit;

namespace Infrastructure.Tests.Services;

public class DomainEventDispatcherTests
{
    [Fact]
    public async Task PublishAsync_WithNoEvents_ReturnsSuccess()
    {
        // Arrange
        var mockServiceProvider = new Mock<IServiceProvider>();
        var mockLogger = new Mock<ILogger<DomainEventDispatcher>>();
        var dispatcher = new DomainEventDispatcher(mockServiceProvider.Object, mockLogger.Object);

        // Act
        var result = await dispatcher.PublishAsync(new List<IDomainEvent>(), CancellationToken.None);

        // Assert
        Assert.True(result.IsSuccess);
    }

    [Fact]
    public async Task PublishAsync_WithNullEvents_ReturnsSuccess()
    {
        // Arrange
        var mockServiceProvider = new Mock<IServiceProvider>();
        var mockLogger = new Mock<ILogger<DomainEventDispatcher>>();
        var dispatcher = new DomainEventDispatcher(mockServiceProvider.Object, mockLogger.Object);

        // Act
        var result = await dispatcher.PublishAsync(null!, CancellationToken.None);

        // Assert
        Assert.True(result.IsSuccess);
    }

    [Fact]
    public async Task PublishAsync_WithEventButNoHandlers_ReturnsSuccess()
    {
        // Arrange
        var services = new ServiceCollection();
        services.AddLogging(builder => builder.AddConsole());
        
        var serviceProvider = services.BuildServiceProvider();
        var logger = serviceProvider.GetRequiredService<ILogger<DomainEventDispatcher>>();

        var dispatcher = new DomainEventDispatcher(serviceProvider, logger);
        var domainEvent = new ModelUploadedEvent(1, 10, "test-hash", true);

        // Act
        var result = await dispatcher.PublishAsync(new[] { domainEvent }, CancellationToken.None);

        // Assert
        Assert.True(result.IsSuccess);
    }
}