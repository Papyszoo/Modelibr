using Infrastructure.WebDav;
using Xunit;

namespace Infrastructure.Tests.WebDav;

public class WebDavUtilitiesTests
{
    private sealed record Candidate(int Id, string Name);

    // ── GetExtension / GetVirtualFileName (pre-existing behavior — regression guard) ──

    [Fact]
    public void GetExtension_WithExtension_ReturnsExtensionWithoutDot()
    {
        Assert.Equal("blend", WebDavUtilities.GetExtension("Chair.blend"));
    }

    [Fact]
    public void GetExtension_WithoutExtension_ReturnsEmptyString()
    {
        Assert.Equal("", WebDavUtilities.GetExtension("Chair"));
    }

    [Fact]
    public void GetVirtualFileName_BuildsNameFromAssetNameAndOriginalExtension()
    {
        Assert.Equal("Footstep.wav", WebDavUtilities.GetVirtualFileName("Footstep", "original-upload-name.wav"));
    }

    // ── TryParseIdSuffix ─────────────────────────────────────────────────────

    [Fact]
    public void TryParseIdSuffix_FolderForm_ParsesNameAndId()
    {
        var success = WebDavUtilities.TryParseIdSuffix("Chair [42]", out var baseName, out var id);

        Assert.True(success);
        Assert.Equal("Chair", baseName);
        Assert.Equal(42, id);
    }

    [Fact]
    public void TryParseIdSuffix_FlatFileForm_ParsesNamePlusExtensionAndId()
    {
        var success = WebDavUtilities.TryParseIdSuffix("Footstep [17].wav", out var baseName, out var id);

        Assert.True(success);
        Assert.Equal("Footstep.wav", baseName);
        Assert.Equal(17, id);
    }

    [Fact]
    public void TryParseIdSuffix_NameContainingDots_TreatsLastDotGroupAsExtensionOnly()
    {
        // "v1.2 Kick.wav" — the suffix insertion point is right before the real
        // extension; dots earlier in the name must not be mistaken for it.
        var success = WebDavUtilities.TryParseIdSuffix("v1.2 Kick [9].wav", out var baseName, out var id);

        Assert.True(success);
        Assert.Equal("v1.2 Kick.wav", baseName);
        Assert.Equal(9, id);
    }

    [Fact]
    public void TryParseIdSuffix_FolderNameContainingDot_KeepsDotAsPartOfName()
    {
        // No extension for folders — a dot in the name is just part of the name.
        var success = WebDavUtilities.TryParseIdSuffix("Chair.old [42]", out var baseName, out var id);

        Assert.True(success);
        Assert.Equal("Chair.old", baseName);
        Assert.Equal(42, id);
    }

    [Theory]
    [InlineData("Chair")]
    [InlineData("Chair.blend")]
    [InlineData("Chair (2)")]
    [InlineData("Chair [abc]")]
    [InlineData("Chair[42]")] // missing the required space before '['
    [InlineData("")]
    public void TryParseIdSuffix_NonMatchingSegment_ReturnsFalse(string segment)
    {
        var success = WebDavUtilities.TryParseIdSuffix(segment, out var baseName, out var id);

        Assert.False(success);
        Assert.Equal(segment, baseName);
        Assert.Equal(0, id);
    }

    // ── FormatWithIdSuffix ───────────────────────────────────────────────────

    [Fact]
    public void FormatWithIdSuffix_ProducesSharedConvention()
    {
        Assert.Equal("Chair [42]", WebDavUtilities.FormatWithIdSuffix("Chair", 42));
    }

    // ── ComputeDisplayNames ──────────────────────────────────────────────────

    [Fact]
    public void ComputeDisplayNames_NoCollisions_ReturnsPlainNames()
    {
        var candidates = new[] { new Candidate(1, "Chair"), new Candidate(2, "Table") };

        var result = WebDavUtilities.ComputeDisplayNames(candidates, c => c.Id, c => c.Name);

        Assert.Equal("Chair", result[1]);
        Assert.Equal("Table", result[2]);
    }

    [Fact]
    public void ComputeDisplayNames_ExactNameCollision_SuffixesAllColliders()
    {
        var candidates = new[] { new Candidate(42, "Chair"), new Candidate(57, "Chair") };

        var result = WebDavUtilities.ComputeDisplayNames(candidates, c => c.Id, c => c.Name);

        Assert.Equal("Chair [42]", result[42]);
        Assert.Equal("Chair [57]", result[57]);
    }

    [Fact]
    public void ComputeDisplayNames_CaseInsensitiveCollision_SuffixesAllColliders()
    {
        var candidates = new[] { new Candidate(1, "Chair"), new Candidate(2, "chair") };

        var result = WebDavUtilities.ComputeDisplayNames(candidates, c => c.Id, c => c.Name);

        Assert.Equal("Chair [1]", result[1]);
        Assert.Equal("chair [2]", result[2]);
    }

    [Fact]
    public void ComputeDisplayNames_ThreeWayCollision_SuffixesAllThree()
    {
        var candidates = new[] { new Candidate(1, "Chair"), new Candidate(2, "Chair"), new Candidate(3, "Chair") };

        var result = WebDavUtilities.ComputeDisplayNames(candidates, c => c.Id, c => c.Name);

        Assert.Equal("Chair [1]", result[1]);
        Assert.Equal("Chair [2]", result[2]);
        Assert.Equal("Chair [3]", result[3]);
    }

    [Fact]
    public void ComputeDisplayNames_CollisionScopeIsExactlyThePassedCandidates()
    {
        // Two "Chair" among the passed-in siblings collide; a third "Chair" outside
        // the passed set (simulating a different listing scope, e.g. another project)
        // is irrelevant — collision detection must not reach beyond the given candidates.
        var candidates = new[] { new Candidate(1, "Chair"), new Candidate(2, "Table") };

        var result = WebDavUtilities.ComputeDisplayNames(candidates, c => c.Id, c => c.Name);

        Assert.Equal("Chair", result[1]);
        Assert.Equal("Table", result[2]);
    }

    // ── ResolveSegment ───────────────────────────────────────────────────────

    [Fact]
    public void ResolveSegment_PlainSegment_UniqueMatch_Resolves()
    {
        var candidates = new[] { new Candidate(1, "Chair"), new Candidate(2, "Table") };

        var result = WebDavUtilities.ResolveSegment("Chair", candidates, c => c.Id, c => c.Name);

        Assert.NotNull(result);
        Assert.Equal(1, result!.Id);
    }

    [Fact]
    public void ResolveSegment_PlainSegment_CaseInsensitiveUniqueMatch_Resolves()
    {
        var candidates = new[] { new Candidate(1, "Chair") };

        var result = WebDavUtilities.ResolveSegment("chair", candidates, c => c.Id, c => c.Name);

        Assert.NotNull(result);
        Assert.Equal(1, result!.Id);
    }

    [Fact]
    public void ResolveSegment_PlainSegment_AmbiguousDuplicates_ReturnsNull()
    {
        // Two "Chair" siblings and the client asks for the bare, undisambiguated name —
        // must never guess which one to serve.
        var candidates = new[] { new Candidate(42, "Chair"), new Candidate(57, "Chair") };

        var result = WebDavUtilities.ResolveSegment("Chair", candidates, c => c.Id, c => c.Name);

        Assert.Null(result);
    }

    [Fact]
    public void ResolveSegment_PlainSegment_NoMatch_ReturnsNull()
    {
        var candidates = new[] { new Candidate(1, "Chair") };

        var result = WebDavUtilities.ResolveSegment("Table", candidates, c => c.Id, c => c.Name);

        Assert.Null(result);
    }

    [Fact]
    public void ResolveSegment_IdSuffixSegment_ResolvesTheExactColliderById()
    {
        var candidates = new[] { new Candidate(42, "Chair"), new Candidate(57, "Chair") };

        var result = WebDavUtilities.ResolveSegment("Chair [57]", candidates, c => c.Id, c => c.Name);

        Assert.NotNull(result);
        Assert.Equal(57, result!.Id);
    }

    [Fact]
    public void ResolveSegment_IdSuffixSegment_IdExistsButNameMismatch_FallsBackToPlainNameAmbiguityGuard()
    {
        // "Chair [57]" as a literal plain name doesn't exist among the candidates and
        // id 57's actual name is "Table" (stale/bogus suffix) — must not resolve.
        var candidates = new[] { new Candidate(57, "Table") };

        var result = WebDavUtilities.ResolveSegment("Chair [57]", candidates, c => c.Id, c => c.Name);

        Assert.Null(result);
    }

    [Fact]
    public void ResolveSegment_IdSuffixSegment_NoCollisionButValidIdAndName_StillResolves()
    {
        // Even without an active collision, an id-suffixed segment for a real
        // id+name pair is a valid, stable way to address the asset.
        var candidates = new[] { new Candidate(42, "Chair") };

        var result = WebDavUtilities.ResolveSegment("Chair [42]", candidates, c => c.Id, c => c.Name);

        Assert.NotNull(result);
        Assert.Equal(42, result!.Id);
    }

    [Fact]
    public void ResolveSegment_FlatFileForm_ResolvesByIdWithExtensionAttached()
    {
        var candidates = new[]
        {
            new Candidate(17, "Footstep.wav"),
            new Candidate(23, "Footstep.wav"),
        };

        var result = WebDavUtilities.ResolveSegment("Footstep [17].wav", candidates, c => c.Id, c => c.Name);

        Assert.NotNull(result);
        Assert.Equal(17, result!.Id);
    }
}
