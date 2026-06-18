using Domain.Models;
using Domain.ValueObjects;
using Infrastructure.Persistence;
using Infrastructure.Repositories;
using Microsoft.EntityFrameworkCore;
using Xunit;
using DomainFile = Domain.Models.File;

namespace Infrastructure.Tests.Repositories;

public class FileRepositoryTests
{
    private static ApplicationDbContext NewContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;
        var context = new ApplicationDbContext(options);
        context.Database.EnsureCreated();
        return context;
    }

    private static DomainFile CreateFile(string hash)
        => DomainFile.Create(
            "player.lua",
            "stored_player.lua",
            "/path/to/player.lua",
            "text/plain",
            FileType.Lua,
            1024L,
            hash,
            DateTime.UtcNow);

    [Fact]
    public async Task IsFileHashReferencedByOthersAsync_ReturnsTrue_WhenAnotherScriptSharesTheFile()
    {
        // Regression: scripts are content-addressed and can share a File (e.g.
        // two scripts edited to identical content). Permanently deleting one must
        // not hard-delete the File a sibling Script still references (which would
        // cascade-delete the live Script).
        await using var context = NewContext();
        var file = CreateFile("aa11bb22cc33dd44ee55ff66aa11bb22cc33dd44ee55ff66aa11bb22cc33dd44");
        context.Files.Add(file);
        await context.SaveChangesAsync();

        context.Scripts.AddRange(
            Script.Create("A", file, "lua", 1, 1, DateTime.UtcNow),
            Script.Create("B", file, "lua", 1, 1, DateTime.UtcNow));
        await context.SaveChangesAsync();

        var repository = new FileRepository(context);

        var referenced = await repository.IsFileHashReferencedByOthersAsync(file.Id);

        Assert.True(referenced);
    }

    [Fact]
    public async Task IsFileHashReferencedByOthersAsync_ReturnsFalse_WhenNoOtherEntityReferencesTheFile()
    {
        await using var context = NewContext();
        var file = CreateFile("bb22cc33dd44ee55ff66aa11bb22cc33dd44ee55ff66aa11bb22cc33dd44ee55");
        context.Files.Add(file);
        await context.SaveChangesAsync();

        var repository = new FileRepository(context);

        var referenced = await repository.IsFileHashReferencedByOthersAsync(file.Id);

        Assert.False(referenced);
    }
}
