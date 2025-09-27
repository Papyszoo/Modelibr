using Domain.Models;
using Infrastructure.Persistence;
using Infrastructure.Repositories;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Infrastructure.Tests.Integration;

public class TexturePackPersistenceTests
{
    [Fact]
    public async Task TexturePackRepository_LoadsModelsCorrectly()
    {
        // Arrange
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: System.Guid.NewGuid().ToString())
            .Options;

        using var context = new ApplicationDbContext(options);
        await context.Database.EnsureCreatedAsync();

        var repository = new TexturePackRepository(context);

        // Create and save entities with relationship
        var texturePack = TexturePack.Create("Test Pack", DateTime.UtcNow);
        var model1 = Model.Create("Model 1", DateTime.UtcNow);
        var model2 = Model.Create("Model 2", DateTime.UtcNow);
        
        context.TexturePacks.Add(texturePack);
        context.Models.Add(model1);
        context.Models.Add(model2);
        await context.SaveChangesAsync();

        texturePack.AddModel(model1, DateTime.UtcNow.AddMinutes(1));
        texturePack.AddModel(model2, DateTime.UtcNow.AddMinutes(2));
        await context.SaveChangesAsync();

        // Act - Load texture pack through repository
        var loadedTexturePack = await repository.GetByIdAsync(texturePack.Id);

        // Assert
        Assert.NotNull(loadedTexturePack);
        Assert.Equal(2, loadedTexturePack.Models.Count);
        Assert.Contains(loadedTexturePack.Models, m => m.Name == "Model 1");
        Assert.Contains(loadedTexturePack.Models, m => m.Name == "Model 2");
    }

    [Fact]
    public async Task TexturePackModelRelationship_BidirectionalPersistence()
    {
        // Arrange
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: System.Guid.NewGuid().ToString())
            .Options;

        // Create relationship from TexturePack side
        using (var context = new ApplicationDbContext(options))
        {
            await context.Database.EnsureCreatedAsync();

            var texturePack = TexturePack.Create("Bidirectional Pack", DateTime.UtcNow);
            var model = Model.Create("Bidirectional Model", DateTime.UtcNow);
            
            context.TexturePacks.Add(texturePack);
            context.Models.Add(model);
            await context.SaveChangesAsync();

            // Add from TexturePack side
            texturePack.AddModel(model, DateTime.UtcNow.AddMinutes(1));
            await context.SaveChangesAsync();
        }

        // Verify relationship is accessible from both sides
        using (var context = new ApplicationDbContext(options))
        {
            var texturePack = await context.TexturePacks
                .Include(tp => tp.Models)
                .FirstAsync();

            var model = await context.Models
                .Include(m => m.TexturePacks)
                .FirstAsync();

            // Assert TexturePack -> Model
            Assert.Single(texturePack.Models);
            Assert.Equal("Bidirectional Model", texturePack.Models.First().Name);

            // Assert Model -> TexturePack
            Assert.Single(model.TexturePacks);
            Assert.Equal("Bidirectional Pack", model.TexturePacks.First().Name);
        }
    }

    [Fact]
    public async Task TexturePackRepository_GetAllIncludesModels()
    {
        // Arrange
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: System.Guid.NewGuid().ToString())
            .Options;

        using var context = new ApplicationDbContext(options);
        await context.Database.EnsureCreatedAsync();

        var repository = new TexturePackRepository(context);

        // Create entities
        var texturePack1 = TexturePack.Create("Pack 1", DateTime.UtcNow);
        var texturePack2 = TexturePack.Create("Pack 2", DateTime.UtcNow);
        var model = Model.Create("Shared Model", DateTime.UtcNow);
        
        context.TexturePacks.AddRange(texturePack1, texturePack2);
        context.Models.Add(model);
        await context.SaveChangesAsync();

        // Associate model with both packs
        texturePack1.AddModel(model, DateTime.UtcNow.AddMinutes(1));
        texturePack2.AddModel(model, DateTime.UtcNow.AddMinutes(2));
        await context.SaveChangesAsync();

        // Act
        var allTexturePacks = await repository.GetAllAsync();

        // Assert
        Assert.Equal(2, allTexturePacks.Count());
        Assert.All(allTexturePacks, tp => 
        {
            Assert.Single(tp.Models);
            Assert.Equal("Shared Model", tp.Models.First().Name);
        });
    }
}