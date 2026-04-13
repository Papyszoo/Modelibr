using Domain.Models;
using Xunit;

namespace Domain.Tests.Unit;

public class TextureSetCategoryDomainTests
{
    [Fact]
    public void Create_WithValidData_ReturnsCategory()
    {
        var createdAt = DateTime.UtcNow;

        var category = TextureSetCategory.Create("Materials", "Reusable materials", null, createdAt);

        Assert.Equal("Materials", category.Name);
        Assert.Null(category.ParentId);
        Assert.Equal(createdAt, category.CreatedAt);
    }
}
