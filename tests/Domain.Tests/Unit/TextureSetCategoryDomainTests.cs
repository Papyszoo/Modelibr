using Domain.Models;
using Domain.ValueObjects;
using Xunit;

namespace Domain.Tests.Unit;

public class TextureSetCategoryDomainTests
{
    [Fact]
    public void Create_WithValidData_ReturnsCategory()
    {
        var createdAt = DateTime.UtcNow;

        var category = TextureSetCategory.Create(
            "Materials", "Reusable materials", null, TextureSetKind.Universal, createdAt);

        Assert.Equal("Materials", category.Name);
        Assert.Null(category.ParentId);
        Assert.Equal(TextureSetKind.Universal, category.Kind);
        Assert.Equal(createdAt, category.CreatedAt);
    }

    [Fact]
    public void Create_WithModelOwnedKind_Throws()
    {
        Assert.Throws<ArgumentException>(() =>
            TextureSetCategory.Create("Invalid", null, null, TextureSetKind.ModelOwned, DateTime.UtcNow));
    }
}
