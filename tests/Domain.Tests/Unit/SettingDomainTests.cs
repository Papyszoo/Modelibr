using Domain.Models;
using Xunit;

namespace Domain.Tests.Unit;

public class SettingDomainTests
{
    [Fact]
    public void Create_WithValidData_ReturnsSetting()
    {
        // Arrange
        var key = "MaxFileSizeBytes";
        var value = "1073741824";
        var description = "Maximum file size in bytes";
        var createdAt = DateTime.UtcNow;

        // Act
        var setting = Setting.Create(key, value, createdAt, description);

        // Assert
        Assert.Equal(key, setting.Key);
        Assert.Equal(value, setting.Value);
        Assert.Equal(description, setting.Description);
        Assert.Equal(createdAt, setting.CreatedAt);
        Assert.Equal(createdAt, setting.UpdatedAt);
    }

    [Fact]
    public void Create_WithoutDescription_ReturnsSetting()
    {
        // Arrange
        var key = "TestKey";
        var value = "TestValue";
        var createdAt = DateTime.UtcNow;

        // Act
        var setting = Setting.Create(key, value, createdAt);

        // Assert
        Assert.Equal(key, setting.Key);
        Assert.Equal(value, setting.Value);
        Assert.Null(setting.Description);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Create_WithInvalidKey_ThrowsArgumentException(string key)
    {
        // Arrange
        var value = "TestValue";
        var createdAt = DateTime.UtcNow;

        // Act & Assert
        Assert.Throws<ArgumentException>(() => Setting.Create(key, value, createdAt));
    }

    [Fact]
    public void Create_WithNullKey_ThrowsArgumentException()
    {
        // Arrange
        var value = "TestValue";
        var createdAt = DateTime.UtcNow;

        // Act & Assert
        Assert.Throws<ArgumentException>(() => Setting.Create(null!, value, createdAt));
    }

    [Fact]
    public void Create_WithKeyTooLong_ThrowsArgumentException()
    {
        // Arrange
        var key = new string('a', 101);
        var value = "TestValue";
        var createdAt = DateTime.UtcNow;

        // Act & Assert
        Assert.Throws<ArgumentException>(() => Setting.Create(key, value, createdAt));
    }

    [Fact]
    public void Create_WithNullValue_ThrowsArgumentNullException()
    {
        // Arrange
        var key = "TestKey";
        var createdAt = DateTime.UtcNow;

        // Act & Assert
        Assert.Throws<ArgumentNullException>(() => Setting.Create(key, null!, createdAt));
    }

    [Fact]
    public void Create_WithValueTooLong_ThrowsArgumentException()
    {
        // Arrange
        var key = "TestKey";
        var value = new string('a', 1001);
        var createdAt = DateTime.UtcNow;

        // Act & Assert
        Assert.Throws<ArgumentException>(() => Setting.Create(key, value, createdAt));
    }

    [Fact]
    public void UpdateValue_WithValidValue_UpdatesValue()
    {
        // Arrange
        var setting = Setting.Create("TestKey", "OldValue", DateTime.UtcNow);
        var newValue = "NewValue";
        var updatedAt = DateTime.UtcNow.AddHours(1);

        // Act
        setting.UpdateValue(newValue, updatedAt);

        // Assert
        Assert.Equal(newValue, setting.Value);
        Assert.Equal(updatedAt, setting.UpdatedAt);
    }

    [Fact]
    public void UpdateValue_WithNullValue_ThrowsArgumentNullException()
    {
        // Arrange
        var setting = Setting.Create("TestKey", "OldValue", DateTime.UtcNow);
        var updatedAt = DateTime.UtcNow.AddHours(1);

        // Act & Assert
        Assert.Throws<ArgumentNullException>(() => setting.UpdateValue(null!, updatedAt));
    }

    [Fact]
    public void UpdateValue_WithValueTooLong_ThrowsArgumentException()
    {
        // Arrange
        var setting = Setting.Create("TestKey", "OldValue", DateTime.UtcNow);
        var newValue = new string('a', 1001);
        var updatedAt = DateTime.UtcNow.AddHours(1);

        // Act & Assert
        Assert.Throws<ArgumentException>(() => setting.UpdateValue(newValue, updatedAt));
    }

    [Fact]
    public void UpdateDescription_WithValidDescription_UpdatesDescription()
    {
        // Arrange
        var setting = Setting.Create("TestKey", "TestValue", DateTime.UtcNow, "Old description");
        var newDescription = "New description";
        var updatedAt = DateTime.UtcNow.AddHours(1);

        // Act
        setting.UpdateDescription(newDescription, updatedAt);

        // Assert
        Assert.Equal(newDescription, setting.Description);
        Assert.Equal(updatedAt, setting.UpdatedAt);
    }

    [Fact]
    public void UpdateDescription_WithNullDescription_UpdatesDescriptionToNull()
    {
        // Arrange
        var setting = Setting.Create("TestKey", "TestValue", DateTime.UtcNow, "Old description");
        var updatedAt = DateTime.UtcNow.AddHours(1);

        // Act
        setting.UpdateDescription(null, updatedAt);

        // Assert
        Assert.Null(setting.Description);
        Assert.Equal(updatedAt, setting.UpdatedAt);
    }
}
