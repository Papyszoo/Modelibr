using Domain.Models;
using Domain.ValueObjects;
using Xunit;
using DomainFile = Domain.Models.File;

namespace Domain.Tests.Unit;

public class TexturePackDomainTests
{
    [Fact]
    public void Create_WithValidName_ReturnsTexturePack()
    {
        // Arrange
        var name = "My Texture Pack";
        var createdAt = DateTime.UtcNow;

        // Act
        var texturePack = TexturePack.Create(name, createdAt);

        // Assert
        Assert.NotNull(texturePack);
        Assert.Equal(name, texturePack.Name);
        Assert.Equal(createdAt, texturePack.CreatedAt);
        Assert.Equal(createdAt, texturePack.UpdatedAt);
        Assert.Empty(texturePack.Textures);
        Assert.True(texturePack.IsEmpty);
        Assert.Equal(0, texturePack.TextureCount);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Create_WithInvalidName_ThrowsArgumentException(string name)
    {
        // Arrange
        var createdAt = DateTime.UtcNow;

        // Act & Assert
        Assert.Throws<ArgumentException>(() => TexturePack.Create(name, createdAt));
    }

    [Fact]
    public void Create_WithNameTooLong_ThrowsArgumentException()
    {
        // Arrange
        var name = new string('a', 201); // 201 characters, exceeds 200 limit
        var createdAt = DateTime.UtcNow;

        // Act & Assert
        var exception = Assert.Throws<ArgumentException>(() => TexturePack.Create(name, createdAt));
        Assert.Contains("200 characters", exception.Message);
    }

    [Fact]
    public void Create_WithNameAtMaxLength_ReturnsTexturePack()
    {
        // Arrange
        var name = new string('a', 200); // Exactly 200 characters
        var createdAt = DateTime.UtcNow;

        // Act
        var texturePack = TexturePack.Create(name, createdAt);

        // Assert
        Assert.NotNull(texturePack);
        Assert.Equal(name, texturePack.Name);
    }

    [Fact]
    public void Create_WithNameWithWhitespace_TrimsWhitespace()
    {
        // Arrange
        var name = "  My Texture Pack  ";
        var expectedName = "My Texture Pack";
        var createdAt = DateTime.UtcNow;

        // Act
        var texturePack = TexturePack.Create(name, createdAt);

        // Assert
        Assert.Equal(expectedName, texturePack.Name);
    }

    [Fact]
    public void UpdateName_WithValidName_UpdatesNameAndTimestamp()
    {
        // Arrange
        var texturePack = TexturePack.Create("Original Name", DateTime.UtcNow);
        var newName = "Updated Name";
        var updatedAt = DateTime.UtcNow.AddMinutes(1);

        // Act
        texturePack.UpdateName(newName, updatedAt);

        // Assert
        Assert.Equal(newName, texturePack.Name);
        Assert.Equal(updatedAt, texturePack.UpdatedAt);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void UpdateName_WithInvalidName_ThrowsArgumentException(string newName)
    {
        // Arrange
        var texturePack = TexturePack.Create("Original Name", DateTime.UtcNow);
        var updatedAt = DateTime.UtcNow.AddMinutes(1);

        // Act & Assert
        Assert.Throws<ArgumentException>(() => texturePack.UpdateName(newName, updatedAt));
    }

    [Fact]
    public void AddTexture_WithValidTexture_AddsTextureSuccessfully()
    {
        // Arrange
        var texturePack = TexturePack.Create("Test Pack", DateTime.UtcNow);
        var texture = CreateValidTexture(TextureType.Albedo);
        var updatedAt = DateTime.UtcNow.AddMinutes(1);

        // Act
        texturePack.AddTexture(texture, updatedAt);

        // Assert
        Assert.Single(texturePack.Textures);
        Assert.Contains(texture, texturePack.Textures);
        Assert.Equal(1, texturePack.TextureCount);
        Assert.False(texturePack.IsEmpty);
        Assert.Equal(updatedAt, texturePack.UpdatedAt);
        Assert.True(texturePack.HasTextureOfType(TextureType.Albedo));
    }

    [Fact]
    public void AddTexture_WithNullTexture_ThrowsArgumentNullException()
    {
        // Arrange
        var texturePack = TexturePack.Create("Test Pack", DateTime.UtcNow);
        Texture? texture = null;
        var updatedAt = DateTime.UtcNow.AddMinutes(1);

        // Act & Assert
        Assert.Throws<ArgumentNullException>(() => texturePack.AddTexture(texture!, updatedAt));
    }

    [Fact]
    public void AddTexture_WithDuplicateTextureType_ThrowsInvalidOperationException()
    {
        // Arrange
        var texturePack = TexturePack.Create("Test Pack", DateTime.UtcNow);
        var texture1 = CreateValidTexture(TextureType.Albedo);
        var texture2 = CreateValidTexture(TextureType.Albedo); // Same type
        var updatedAt = DateTime.UtcNow.AddMinutes(1);

        texturePack.AddTexture(texture1, updatedAt);

        // Act & Assert
        var exception = Assert.Throws<InvalidOperationException>(() => texturePack.AddTexture(texture2, updatedAt));
        Assert.Contains("already exists", exception.Message);
        Assert.Contains("Albedo", exception.Message);
    }

    [Fact]
    public void AddTexture_WithMultipleDifferentTypes_AddsAllSuccessfully()
    {
        // Arrange
        var texturePack = TexturePack.Create("Test Pack", DateTime.UtcNow);
        var albedoTexture = CreateValidTexture(TextureType.Albedo);
        var normalTexture = CreateValidTexture(TextureType.Normal);
        var roughnessTexture = CreateValidTexture(TextureType.Roughness);
        var updatedAt = DateTime.UtcNow.AddMinutes(1);

        // Act
        texturePack.AddTexture(albedoTexture, updatedAt);
        texturePack.AddTexture(normalTexture, updatedAt);
        texturePack.AddTexture(roughnessTexture, updatedAt);

        // Assert
        Assert.Equal(3, texturePack.TextureCount);
        Assert.True(texturePack.HasTextureOfType(TextureType.Albedo));
        Assert.True(texturePack.HasTextureOfType(TextureType.Normal));
        Assert.True(texturePack.HasTextureOfType(TextureType.Roughness));
        Assert.False(texturePack.HasTextureOfType(TextureType.Metallic));
    }

    [Fact]
    public void RemoveTexture_WithExistingTexture_RemovesTextureSuccessfully()
    {
        // Arrange
        var texturePack = TexturePack.Create("Test Pack", DateTime.UtcNow);
        var texture = CreateValidTexture(TextureType.Albedo);
        var updatedAt = DateTime.UtcNow.AddMinutes(1);
        
        texturePack.AddTexture(texture, updatedAt);
        var removeTime = updatedAt.AddMinutes(1);

        // Act
        texturePack.RemoveTexture(texture, removeTime);

        // Assert
        Assert.Empty(texturePack.Textures);
        Assert.Equal(0, texturePack.TextureCount);
        Assert.True(texturePack.IsEmpty);
        Assert.Equal(removeTime, texturePack.UpdatedAt);
        Assert.False(texturePack.HasTextureOfType(TextureType.Albedo));
    }

    [Fact]
    public void RemoveTexture_WithNonExistentTexture_DoesNotUpdateTimestamp()
    {
        // Arrange
        var texturePack = TexturePack.Create("Test Pack", DateTime.UtcNow);
        var texture = CreateValidTexture(TextureType.Albedo);
        var originalUpdatedAt = texturePack.UpdatedAt;
        var removeTime = DateTime.UtcNow.AddMinutes(1);

        // Act
        texturePack.RemoveTexture(texture, removeTime);

        // Assert
        Assert.Empty(texturePack.Textures);
        Assert.Equal(originalUpdatedAt, texturePack.UpdatedAt); // Should not change
    }

    [Fact]
    public void RemoveTexture_WithNullTexture_ThrowsArgumentNullException()
    {
        // Arrange
        var texturePack = TexturePack.Create("Test Pack", DateTime.UtcNow);
        Texture? texture = null;
        var updatedAt = DateTime.UtcNow.AddMinutes(1);

        // Act & Assert
        Assert.Throws<ArgumentNullException>(() => texturePack.RemoveTexture(texture!, updatedAt));
    }

    [Fact]
    public void RemoveTextureOfType_WithExistingType_RemovesAndReturnsTrue()
    {
        // Arrange
        var texturePack = TexturePack.Create("Test Pack", DateTime.UtcNow);
        var texture = CreateValidTexture(TextureType.Albedo);
        var updatedAt = DateTime.UtcNow.AddMinutes(1);
        
        texturePack.AddTexture(texture, updatedAt);
        var removeTime = updatedAt.AddMinutes(1);

        // Act
        var result = texturePack.RemoveTextureOfType(TextureType.Albedo, removeTime);

        // Assert
        Assert.True(result);
        Assert.False(texturePack.HasTextureOfType(TextureType.Albedo));
        Assert.Equal(0, texturePack.TextureCount);
        Assert.Equal(removeTime, texturePack.UpdatedAt);
    }

    [Fact]
    public void RemoveTextureOfType_WithNonExistentType_ReturnsFalse()
    {
        // Arrange
        var texturePack = TexturePack.Create("Test Pack", DateTime.UtcNow);
        var originalUpdatedAt = texturePack.UpdatedAt;
        var removeTime = DateTime.UtcNow.AddMinutes(1);

        // Act
        var result = texturePack.RemoveTextureOfType(TextureType.Albedo, removeTime);

        // Assert
        Assert.False(result);
        Assert.Equal(originalUpdatedAt, texturePack.UpdatedAt); // Should not change
    }

    [Fact]
    public void GetTextureOfType_WithExistingType_ReturnsTexture()
    {
        // Arrange
        var texturePack = TexturePack.Create("Test Pack", DateTime.UtcNow);
        var texture = CreateValidTexture(TextureType.Albedo);
        
        texturePack.AddTexture(texture, DateTime.UtcNow);

        // Act
        var retrievedTexture = texturePack.GetTextureOfType(TextureType.Albedo);

        // Assert
        Assert.NotNull(retrievedTexture);
        Assert.Equal(texture, retrievedTexture);
        Assert.Equal(TextureType.Albedo, retrievedTexture.TextureType);
    }

    [Fact]
    public void GetTextureOfType_WithNonExistentType_ReturnsNull()
    {
        // Arrange
        var texturePack = TexturePack.Create("Test Pack", DateTime.UtcNow);

        // Act
        var retrievedTexture = texturePack.GetTextureOfType(TextureType.Albedo);

        // Assert
        Assert.Null(retrievedTexture);
    }

    [Fact]
    public void GetTextureTypes_WithMultipleTextures_ReturnsAllTypes()
    {
        // Arrange
        var texturePack = TexturePack.Create("Test Pack", DateTime.UtcNow);
        var albedoTexture = CreateValidTexture(TextureType.Albedo);
        var normalTexture = CreateValidTexture(TextureType.Normal);
        var roughnessTexture = CreateValidTexture(TextureType.Roughness);
        
        texturePack.AddTexture(albedoTexture, DateTime.UtcNow);
        texturePack.AddTexture(normalTexture, DateTime.UtcNow);
        texturePack.AddTexture(roughnessTexture, DateTime.UtcNow);

        // Act
        var textureTypes = texturePack.GetTextureTypes();

        // Assert
        Assert.Equal(3, textureTypes.Count);
        Assert.Contains(TextureType.Albedo, textureTypes);
        Assert.Contains(TextureType.Normal, textureTypes);
        Assert.Contains(TextureType.Roughness, textureTypes);
    }

    [Fact]
    public void GetTextureTypes_WithEmptyPack_ReturnsEmptyList()
    {
        // Arrange
        var texturePack = TexturePack.Create("Test Pack", DateTime.UtcNow);

        // Act
        var textureTypes = texturePack.GetTextureTypes();

        // Assert
        Assert.Empty(textureTypes);
    }

    [Fact]
    public void GetDescription_WithEmptyPack_ReturnsCorrectDescription()
    {
        // Arrange
        var texturePack = TexturePack.Create("My Pack", DateTime.UtcNow);

        // Act
        var description = texturePack.GetDescription();

        // Assert
        Assert.Contains("My Pack", description);
        Assert.Contains("0 textures", description);
        Assert.Contains("No textures", description);
    }

    [Fact]
    public void GetDescription_WithTextures_ReturnsCorrectDescription()
    {
        // Arrange
        var texturePack = TexturePack.Create("My Pack", DateTime.UtcNow);
        var albedoTexture = CreateValidTexture(TextureType.Albedo);
        var normalTexture = CreateValidTexture(TextureType.Normal);
        
        texturePack.AddTexture(albedoTexture, DateTime.UtcNow);
        texturePack.AddTexture(normalTexture, DateTime.UtcNow);

        // Act
        var description = texturePack.GetDescription();

        // Assert
        Assert.Contains("My Pack", description);
        Assert.Contains("2 textures", description);
        Assert.Contains("Base color or diffuse map", description); // Albedo description
        Assert.Contains("Normal map for surface detail", description); // Normal description
    }

    [Theory]
    [InlineData(TextureType.Albedo)]
    [InlineData(TextureType.Normal)]
    [InlineData(TextureType.Height)]
    [InlineData(TextureType.AO)]
    [InlineData(TextureType.Roughness)]
    [InlineData(TextureType.Metallic)]
    [InlineData(TextureType.Diffuse)]
    [InlineData(TextureType.Specular)]
    public void HasTextureOfType_WithAllSupportedTypes_WorksCorrectly(TextureType textureType)
    {
        // Arrange
        var texturePack = TexturePack.Create("Test Pack", DateTime.UtcNow);
        var texture = CreateValidTexture(textureType);
        
        texturePack.AddTexture(texture, DateTime.UtcNow);

        // Act & Assert
        Assert.True(texturePack.HasTextureOfType(textureType));
        
        // Verify other types are not present
        var allTypes = TextureTypeExtensions.GetSupportedTypes();
        foreach (var type in allTypes.Where(t => t != textureType))
        {
            Assert.False(texturePack.HasTextureOfType(type));
        }
    }

    [Fact]
    public void TexturePack_InheritsFromAggregateRoot()
    {
        // Arrange & Act
        var texturePack = TexturePack.Create("Test Pack", DateTime.UtcNow);

        // Assert
        Assert.IsAssignableFrom<AggregateRoot>(texturePack);
        Assert.NotNull(texturePack.DomainEvents);
        Assert.Empty(texturePack.DomainEvents);
    }

    #region Model Association Tests

    [Fact]
    public void AddModel_WithValidModel_AddsSuccessfully()
    {
        // Arrange
        var texturePack = TexturePack.Create("Test Texture Pack", DateTime.UtcNow);
        var model = Model.Create("Test Model", DateTime.UtcNow);
        var updatedAt = DateTime.UtcNow.AddMinutes(1);

        // Act
        texturePack.AddModel(model, updatedAt);

        // Assert
        Assert.Single(texturePack.Models);
        Assert.Contains(model, texturePack.Models);
        Assert.Equal(updatedAt, texturePack.UpdatedAt);
    }

    [Fact]
    public void AddModel_WithNullModel_ThrowsArgumentNullException()
    {
        // Arrange
        var texturePack = TexturePack.Create("Test Texture Pack", DateTime.UtcNow);
        var updatedAt = DateTime.UtcNow.AddMinutes(1);

        // Act & Assert
        Assert.Throws<ArgumentNullException>(() => texturePack.AddModel(null!, updatedAt));
    }

    [Fact]
    public void AddModel_WithExistingModel_DoesNotAddDuplicate()
    {
        // Arrange
        var texturePack = TexturePack.Create("Test Texture Pack", DateTime.UtcNow);
        var model = Model.Create("Test Model", DateTime.UtcNow);
        model.Id = 1; // Set ID to simulate existing entity
        var updatedAt = DateTime.UtcNow.AddMinutes(1);
        texturePack.AddModel(model, updatedAt);

        // Act
        texturePack.AddModel(model, updatedAt.AddMinutes(1));

        // Assert
        Assert.Single(texturePack.Models);
    }

    [Fact]
    public void RemoveModel_WithExistingModel_RemovesSuccessfully()
    {
        // Arrange
        var texturePack = TexturePack.Create("Test Texture Pack", DateTime.UtcNow);
        var model = Model.Create("Test Model", DateTime.UtcNow);
        var updatedAt = DateTime.UtcNow.AddMinutes(1);
        texturePack.AddModel(model, updatedAt);

        // Act
        texturePack.RemoveModel(model, updatedAt.AddMinutes(1));

        // Assert
        Assert.Empty(texturePack.Models);
        Assert.Equal(updatedAt.AddMinutes(1), texturePack.UpdatedAt);
    }

    [Fact]
    public void RemoveModel_WithNullModel_ThrowsArgumentNullException()
    {
        // Arrange
        var texturePack = TexturePack.Create("Test Texture Pack", DateTime.UtcNow);
        var updatedAt = DateTime.UtcNow.AddMinutes(1);

        // Act & Assert
        Assert.Throws<ArgumentNullException>(() => texturePack.RemoveModel(null!, updatedAt));
    }

    [Fact]
    public void HasModel_WithExistingModel_ReturnsTrue()
    {
        // Arrange
        var texturePack = TexturePack.Create("Test Texture Pack", DateTime.UtcNow);
        var model = Model.Create("Test Model", DateTime.UtcNow);
        model.Id = 123;
        texturePack.AddModel(model, DateTime.UtcNow.AddMinutes(1));

        // Act
        var hasModel = texturePack.HasModel(123);

        // Assert
        Assert.True(hasModel);
    }

    [Fact]
    public void HasModel_WithNonExistingModel_ReturnsFalse()
    {
        // Arrange
        var texturePack = TexturePack.Create("Test Texture Pack", DateTime.UtcNow);

        // Act
        var hasModel = texturePack.HasModel(999);

        // Assert
        Assert.False(hasModel);
    }

    [Fact]
    public void GetModels_ReturnsReadOnlyList()
    {
        // Arrange
        var texturePack = TexturePack.Create("Test Texture Pack", DateTime.UtcNow);
        var model1 = Model.Create("Model 1", DateTime.UtcNow);
        var model2 = Model.Create("Model 2", DateTime.UtcNow);
        texturePack.AddModel(model1, DateTime.UtcNow.AddMinutes(1));
        texturePack.AddModel(model2, DateTime.UtcNow.AddMinutes(2));

        // Act
        var models = texturePack.GetModels();

        // Assert
        Assert.Equal(2, models.Count);
        Assert.Contains(model1, models);
        Assert.Contains(model2, models);
        Assert.IsAssignableFrom<IReadOnlyList<Model>>(models);
    }

    #endregion

    private static Texture CreateValidTexture(TextureType textureType)
    {
        var file = CreateValidTextureFile();
        return Texture.Create(file, textureType, DateTime.UtcNow);
    }

    private static DomainFile CreateValidTextureFile()
    {
        return DomainFile.Create(
            "texture.jpg",
            "stored_texture.jpg",
            "/path/to/texture.jpg",
            "image/jpeg",
            FileType.Texture,
            1024L,
            "a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890",
            DateTime.UtcNow
        );
    }
}