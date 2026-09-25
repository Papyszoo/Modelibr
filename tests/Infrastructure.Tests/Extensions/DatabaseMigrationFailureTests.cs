using Infrastructure.Extensions;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace Infrastructure.Tests.Extensions;

public sealed class DatabaseMigrationFailureTests
{
    [Fact]
    public async Task RunMigrationAsync_WhenMigrationThrows_ThrowsNamedStartupException()
    {
        var exception = await Assert.ThrowsAsync<DatabaseMigrationFailedException>(
            () => DatabaseExtensions.RunMigrationAsync(
                () => throw new InvalidOperationException("simulated migration failure"),
                NullLogger.Instance));

        Assert.Contains("migration failed", exception.Message, StringComparison.OrdinalIgnoreCase);
        Assert.Equal("simulated migration failure", exception.InnerException?.Message);
    }
}
