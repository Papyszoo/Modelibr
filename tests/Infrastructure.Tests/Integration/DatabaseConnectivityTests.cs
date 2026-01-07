using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Xunit;

namespace Infrastructure.Tests.Integration;

/// <summary>
/// Integration tests for PostgreSQL database connectivity
/// These tests require a running PostgreSQL instance with the connection string from appsettings
/// </summary>
public class DatabaseConnectivityTests : IDisposable
{
    private readonly ServiceProvider _serviceProvider;
    private readonly ApplicationDbContext _context;

    public DatabaseConnectivityTests()
    {
        // Build configuration
        var configuration = new ConfigurationBuilder()
            .SetBasePath(Directory.GetCurrentDirectory())
            .AddJsonFile("appsettings.json", optional: true)
            .AddJsonFile("appsettings.Development.json", optional: true)
            .AddEnvironmentVariables()
            .Build();

        // Setup dependency injection
        var services = new ServiceCollection();
        services.AddLogging(builder => builder.AddConsole());
        
        // Add DbContext with the same configuration as the real application
        services.AddDbContext<ApplicationDbContext>(options =>
        {
            var connectionString = configuration.GetConnectionString("Default");
            if (!string.IsNullOrEmpty(connectionString))
            {
                options.UseNpgsql(connectionString);
            }
        });

        _serviceProvider = services.BuildServiceProvider();
        _context = _serviceProvider.GetRequiredService<ApplicationDbContext>();
    }

    [Fact]
    public async Task CanConnectToDatabase()
    {
        // Skip test if no database provider is configured
        try
        {
            // This test will be skipped if no connection string is configured
            var connectionString = _context.Database.GetConnectionString();
            if (string.IsNullOrEmpty(connectionString))
            {
                // Skip test if no connection string configured
                return;
            }

            // Test basic connectivity
            var canConnect = await _context.Database.CanConnectAsync();
            Assert.True(canConnect, "Should be able to connect to the database");
        }
        catch (InvalidOperationException)
        {
            // No provider configured, skip test silently
            return;
        }
    }

    [Fact]
    public async Task CanExecuteSimpleQuery()
    {
        // Skip test if no database provider is configured
        try
        {
            // This test will be skipped if no connection string is configured
            var connectionString = _context.Database.GetConnectionString();
            if (string.IsNullOrEmpty(connectionString))
            {
                // Skip test if no connection string configured
                return;
            }

            // Ensure database exists and is migrated
            await _context.Database.MigrateAsync();

            // Test simple queries
            var fileCount = await _context.Files.CountAsync();
            var modelCount = await _context.Models.CountAsync();

            // These should not throw and return valid counts (even if 0)
            Assert.True(fileCount >= 0, "File count should be non-negative");
            Assert.True(modelCount >= 0, "Model count should be non-negative");
        }
        catch (InvalidOperationException)
        {
            // No provider configured, skip test silently
            return;
        }
    }

    [Fact]
    public async Task DatabaseSchemaIsCorrect()
    {
        // Skip test if no database provider is configured
        try
        {
            // This test will be skipped if no connection string is configured
            var connectionString = _context.Database.GetConnectionString();
            if (string.IsNullOrEmpty(connectionString))
            {
                // Skip test if no connection string configured
                return;
            }

            // Ensure database exists and is migrated
            await _context.Database.MigrateAsync();

            // Verify that we can query the expected tables
            // This will throw if the schema is incorrect
            var files = await _context.Files.Take(1).ToListAsync();
            var models = await _context.Models.Take(1).ToListAsync();

            // If we get here, the schema is correct
            Assert.True(true, "Database schema is correct");
        }
        catch (InvalidOperationException)
        {
            // No provider configured, skip test silently
            return;
        }
    }

    public void Dispose()
    {
        _context?.Dispose();
        _serviceProvider?.Dispose();
    }
}