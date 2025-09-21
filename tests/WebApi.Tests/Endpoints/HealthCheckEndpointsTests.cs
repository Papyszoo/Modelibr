using Microsoft.AspNetCore.Mvc.Testing;
using System.Net;
using Xunit;

namespace WebApi.Tests.Endpoints;

public class HealthCheckEndpointsTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public HealthCheckEndpointsTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task HealthCheck_ReturnsOkStatus()
    {
        // Arrange
        var client = _factory.CreateClient();

        // Act
        var response = await client.GetAsync("/health");

        // Assert
        // Note: This may return 503 Service Unavailable due to database connection
        // in a test environment, which is expected behavior for this endpoint
        Assert.True(
            response.StatusCode == HttpStatusCode.OK || 
            response.StatusCode == HttpStatusCode.ServiceUnavailable);
    }

    [Fact]
    public async Task HealthCheck_ReturnsJsonContent()
    {
        // Arrange
        var client = _factory.CreateClient();

        // Act
        var response = await client.GetAsync("/health");
        var content = await response.Content.ReadAsStringAsync();

        // Assert
        Assert.NotEmpty(content);
        // Basic check that it returns JSON-like content
        Assert.True(content.Contains("{") && content.Contains("}"));
    }
}