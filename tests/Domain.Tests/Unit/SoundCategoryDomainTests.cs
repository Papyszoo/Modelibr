using Domain.Models;
using Xunit;

namespace Domain.Tests.Unit;

public class SoundCategoryDomainTests
{
    [Fact]
    public void Create_WithParentId_AssignsTreeProperties()
    {
        var createdAt = DateTime.UtcNow;

        var category = SoundCategory.Create("Ambience", "Loops", 3, createdAt);

        Assert.Equal("Ambience", category.Name);
        Assert.Equal(3, category.ParentId);
        Assert.Equal(createdAt, category.CreatedAt);
    }

    [Fact]
    public void MoveTo_WithNewParent_UpdatesParentId()
    {
        var createdAt = DateTime.UtcNow;
        var updatedAt = createdAt.AddMinutes(1);
        var category = SoundCategory.Create("Ambience", null, null, createdAt);

        category.MoveTo(5, updatedAt);

        Assert.Equal(5, category.ParentId);
        Assert.Equal(updatedAt, category.UpdatedAt);
    }
}
