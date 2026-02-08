using Domain.Models;
using Infrastructure.Persistence;
using Infrastructure.Repositories;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Infrastructure.Tests.Integration;

public class TextureSetPersistenceTests
{
    [Fact]
    public async Task TextureSetRepository_LoadsModelsCorrectly()
    {
        // Arrange
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: System.Guid.NewGuid().ToString())
            .Options;

        using var context = new ApplicationDbContext(options);
        await context.Database.EnsureCreatedAsync();

        var repository = new TextureSetRepository(context);

        // Create and save entities with relationship
        var textureSet = TextureSet.Create("Test Pack", DateTime.UtcNow);
        var model1 = Model.Create("Model 1", DateTime.UtcNow);
        var model2 = Model.Create("Model 2", DateTime.UtcNow);
        
        context.TextureSets.Add(textureSet);
        context.Models.Add(model1);
        context.Models.Add(model2);
        await context.SaveChangesAsync();

        textureSet.AddModel(model1, DateTime.UtcNow.AddMinutes(1));
        textureSet.AddModel(model2, DateTime.UtcNow.AddMinutes(2));
        await context.SaveChangesAsync();

        // Act - Load texture set through repository
        var loadedTextureSet = await repository.GetByIdAsync(textureSet.Id);

        // Assert
        Assert.NotNull(loadedTextureSet);
        Assert.Equal(2, loadedTextureSet.Models.Count);
        Assert.Contains(loadedTextureSet.Models, m => m.Name == "Model 1");
        Assert.Contains(loadedTextureSet.Models, m => m.Name == "Model 2");
    }

    [Fact]
    public async Task TextureSetModelRelationship_BidirectionalPersistence()
    {
        // Arrange
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: System.Guid.NewGuid().ToString())
            .Options;

        // Create relationship from TextureSet side
        using (var context = new ApplicationDbContext(options))
        {
            await context.Database.EnsureCreatedAsync();

            var textureSet = TextureSet.Create("Bidirectional Pack", DateTime.UtcNow);
            var model = Model.Create("Bidirectional Model", DateTime.UtcNow);
            
            context.TextureSets.Add(textureSet);
            context.Models.Add(model);
            await context.SaveChangesAsync();

            // Add from TextureSet side
            textureSet.AddModel(model, DateTime.UtcNow.AddMinutes(1));
            await context.SaveChangesAsync();
        }

        // Verify relationship is accessible from both sides
        using (var context = new ApplicationDbContext(options))
        {
            var textureSet = await context.TextureSets
                .Include(tp => tp.Models)
                .FirstAsync();

            var model = await context.Models
                .Include(m => m.TextureSets)
                .FirstAsync();

            // Assert TextureSet -> Model
            Assert.Single(textureSet.Models);
            Assert.Equal("Bidirectional Model", textureSet.Models.First().Name);

            // Assert Model -> TextureSet
            Assert.Single(model.TextureSets);
            Assert.Equal("Bidirectional Pack", model.TextureSets.First().Name);
        }
    }

    [Fact]
    public async Task TextureSetRepository_GetAllIncludesModelVersions()
    {
        // Arrange
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: System.Guid.NewGuid().ToString())
            .Options;

        using var context = new ApplicationDbContext(options);
        await context.Database.EnsureCreatedAsync();

        var repository = new TextureSetRepository(context);

        // Create entities
        var textureSet1 = TextureSet.Create("Pack 1", DateTime.UtcNow);
        var textureSet2 = TextureSet.Create("Pack 2", DateTime.UtcNow);
        var model = Model.Create("Shared Model", DateTime.UtcNow);
        
        context.TextureSets.AddRange(textureSet1, textureSet2);
        context.Models.Add(model);
        await context.SaveChangesAsync();

        var version = ModelVersion.Create(model.Id, 1, null, DateTime.UtcNow);
        context.ModelVersions.Add(version);
        await context.SaveChangesAsync();

        // Associate model version with both texture sets
        textureSet1.AddModelVersion(version, DateTime.UtcNow);
        textureSet2.AddModelVersion(version, DateTime.UtcNow);
        await context.SaveChangesAsync();

        // Use a fresh context to verify includes work without change tracker
        using var freshContext = new ApplicationDbContext(options);
        var freshRepository = new TextureSetRepository(freshContext);

        // Act
        var allTextureSets = await freshRepository.GetAllAsync();

        // Assert
        Assert.Equal(2, allTextureSets.Count());
        Assert.All(allTextureSets, tp => 
        {
            Assert.Single(tp.ModelVersions);
            Assert.Equal("Shared Model", tp.ModelVersions.First().Model.Name);
        });
    }
}