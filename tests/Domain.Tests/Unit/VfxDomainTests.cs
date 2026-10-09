using Domain.Models;
using Xunit;

namespace Domain.Tests.Unit;

public class VfxDomainTests
{
    private static readonly DateTime Now = new(2026, 10, 7, 12, 0, 0, DateTimeKind.Utc);

    private const string ValidDefinition = """{"version":1,"duration":2,"loop":false,"components":[]}""";

    [Fact]
    public void Create_TrimsNameAndStampsTimestamps()
    {
        var vfx = Vfx.Create("  Sparks  ", "A test effect", ValidDefinition, Now);

        Assert.Equal("Sparks", vfx.Name);
        Assert.Equal("A test effect", vfx.Description);
        Assert.Equal(ValidDefinition, vfx.DefinitionJson);
        Assert.Equal(Now, vfx.CreatedAt);
        Assert.Equal(Now, vfx.UpdatedAt);
    }

    [Fact]
    public void SetThumbnailPath_StoresTheTrimmedPathAndStampsTheUpdate()
    {
        var vfx = Vfx.Create("Sparks", null, ValidDefinition, Now);
        var later = Now.AddMinutes(5);

        vfx.SetThumbnailPath("  /uploads/ab/cd/hash  ", later);

        Assert.Equal("/uploads/ab/cd/hash", vfx.ThumbnailPath);
        Assert.Equal(later, vfx.UpdatedAt);
    }

    [Fact]
    public void SetThumbnailPath_RejectsABlankPath()
    {
        var vfx = Vfx.Create("Sparks", null, ValidDefinition, Now);

        Assert.Throws<ArgumentException>(() => vfx.SetThumbnailPath("  ", Now));
    }

    [Fact]
    public void Create_RejectsEmptyName()
    {
        Assert.Throws<ArgumentException>(() => Vfx.Create("   ", null, ValidDefinition, Now));
    }

    [Fact]
    public void Create_RejectsNameOverTwoHundredCharacters()
    {
        Assert.Throws<ArgumentException>(() =>
            Vfx.Create(new string('a', 201), null, ValidDefinition, Now));
    }

    [Fact]
    public void Create_RejectsEmptyDefinition()
    {
        Assert.Throws<ArgumentException>(() => Vfx.Create("Sparks", null, "  ", Now));
    }

    [Fact]
    public void Rename_TrimsAndStamps()
    {
        var vfx = Vfx.Create("Sparks", null, ValidDefinition, Now);
        var later = Now.AddMinutes(1);

        vfx.Rename("  Embers  ", later);

        Assert.Equal("Embers", vfx.Name);
        Assert.Equal(later, vfx.UpdatedAt);
    }

    [Fact]
    public void UpdateDescription_Stamps()
    {
        var vfx = Vfx.Create("Sparks", null, ValidDefinition, Now);
        var later = Now.AddMinutes(1);

        vfx.UpdateDescription("Burning embers", later);

        Assert.Equal("Burning embers", vfx.Description);
        Assert.Equal(later, vfx.UpdatedAt);
    }

    [Fact]
    public void UpdateDefinition_ReplacesTheWholeDefinition()
    {
        var vfx = Vfx.Create("Sparks", null, ValidDefinition, Now);
        var later = Now.AddMinutes(1);
        const string replacement = """{"version":1,"duration":5,"loop":true,"components":[]}""";

        vfx.UpdateDefinition(replacement, later);

        Assert.Equal(replacement, vfx.DefinitionJson);
        Assert.Equal(later, vfx.UpdatedAt);
    }
}
