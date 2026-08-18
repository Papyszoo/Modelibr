using System.Text.Json;
using Application.Models;
using Application.Search;
using Xunit;

namespace Application.Tests.Search;

/// <summary>
/// The distinction these lock is the one <c>hasUvs</c> could not make: an asset can have
/// perfectly good UVs and still be unable to receive a baked texture set, because those UVs
/// spend their texel budget on a texture it shares with hundreds of other models.
/// </summary>
public class UvStatusClassifierTests
{
    private static SceneGraphPartDto Mesh(
        string path,
        bool? hasUvs,
        (double u0, double v0, double u1, double v1)? uvBounds = null)
    {
        // Serialized rather than hand-written: interpolating a double into a JSON string
        // emits `0,01` on a machine whose locale writes decimals with a comma, and the parse
        // then fails on every bounds test rather than on one obvious one.
        JsonElement? detail = uvBounds is { } b
            ? JsonSerializer.SerializeToElement(new
            {
                uvBounds = new
                {
                    min = new[] { b.u0, b.v0 },
                    max = new[] { b.u1, b.v1 },
                },
            })
            : null;
        return new(path, path, null, 1, "mesh", 100, 60, "hash", hasUvs, detail);
    }

    private static SceneGraphPartDto NonMesh(string path, string objectType) =>
        new(path, path, null, 1, objectType, null, null, null, null, null);

    [Fact]
    public void A_mesh_filling_its_own_uv_space_is_unwrapped()
    {
        var parts = new[] { Mesh("Body", true, (0.01, 0.02, 0.99, 0.98)) };

        Assert.Equal(UvStatusClassifier.Unwrapped, UvStatusClassifier.Classify(parts));
    }

    /// <summary>
    /// The POLYGON City case, and the whole reason this classification exists. The UVs are
    /// real, correct, and what makes the model render right today - the asset simply sits on
    /// a few texels of a shared palette swatch, so there is nothing to bake into.
    /// </summary>
    [Fact]
    public void A_mesh_squeezed_onto_a_shared_palette_swatch_is_atlas_packed_not_unwrapped()
    {
        var parts = new[] { Mesh("SM_Prop_CarboardBox_01", true, (0.128, 0.372, 0.139, 0.383)) };

        var status = UvStatusClassifier.Classify(parts);

        Assert.Equal(UvStatusClassifier.AtlasPacked, status);
        Assert.NotEqual(UvStatusClassifier.NoUvs, status);
    }

    /// <summary>
    /// The reason the union is taken across the asset rather than per mesh. Three meshes each
    /// owning a corner of the asset's own atlas is a normal, bakeable unwrap; judging them one
    /// at a time would call every one of them packed and hide the asset from an "unwrapped"
    /// filter it belongs in.
    /// </summary>
    [Fact]
    public void Meshes_sharing_one_atlas_between_themselves_are_unwrapped_as_an_asset()
    {
        var parts = new[]
        {
            Mesh("Body", true, (0.0, 0.0, 0.49, 0.49)),
            Mesh("Hair", true, (0.51, 0.0, 1.0, 0.49)),
            Mesh("Eyes", true, (0.0, 0.51, 1.0, 1.0)),
        };

        Assert.Equal(UvStatusClassifier.Unwrapped, UvStatusClassifier.Classify(parts));
    }

    [Fact]
    public void Uvs_reaching_outside_the_unit_square_are_tiled()
    {
        var parts = new[] { Mesh("SM_Env_Skyline_04", true, (-3.12, 0.02, 4.12, 0.23)) };

        Assert.Equal(UvStatusClassifier.Tiled, UvStatusClassifier.Classify(parts));
    }

    /// <summary>
    /// Tiling is tested before coverage on purpose: a tiling layout's bounding box is larger
    /// than the unit square, so a coverage test alone would read it as generously unwrapped
    /// and promise a bake that cannot work - two surfaces sharing a texel cannot hold
    /// different baked values.
    /// </summary>
    [Fact]
    public void A_tiled_layout_is_not_mistaken_for_a_generous_unwrap()
    {
        var parts = new[] { Mesh("Floor", true, (0.0, 0.0, 8.0, 8.0)) };

        Assert.Equal(UvStatusClassifier.Tiled, UvStatusClassifier.Classify(parts));
    }

    /// <summary>
    /// A hair of bleed past the edge is not a trim sheet. A tolerance of 1.001 would have
    /// swept a good part of the glTF sample assets into <c>tiled</c>.
    /// </summary>
    [Fact]
    public void A_slight_overshoot_past_the_edge_is_still_unwrapped()
    {
        var parts = new[] { Mesh("Ottoman", true, (-0.01, 0.0, 1.02, 1.0)) };

        Assert.Equal(UvStatusClassifier.Unwrapped, UvStatusClassifier.Classify(parts));
    }

    [Fact]
    public void An_asset_with_no_uvs_anywhere_is_no_uvs()
    {
        var parts = new[] { Mesh("Body", false), Mesh("Base", false) };

        Assert.Equal(UvStatusClassifier.NoUvs, UvStatusClassifier.Classify(parts));
    }

    [Fact]
    public void An_asset_where_only_some_meshes_carry_uvs_is_partial()
    {
        var parts = new[]
        {
            Mesh("Body", true, (0.0, 0.0, 1.0, 1.0)),
            Mesh("Strap", false),
        };

        Assert.Equal(UvStatusClassifier.Partial, UvStatusClassifier.Classify(parts));
    }

    /// <summary>
    /// Unknown must not collapse into <c>unwrapped</c>. A filter meaning "ready to bake" that
    /// quietly includes unmeasured assets is worse than one that leaves them out: it hands
    /// back candidates whose UVs nobody has looked at.
    /// </summary>
    [Fact]
    public void Uvs_that_were_never_measured_classify_as_unknown_rather_than_unwrapped()
    {
        var parts = new[] { Mesh("Body", true) };

        Assert.Null(UvStatusClassifier.Classify(parts));
    }

    [Fact]
    public void An_asset_with_no_meshes_classifies_as_unknown()
    {
        var parts = new[] { NonMesh("Armature", "bone"), NonMesh("Root", "group") };

        Assert.Null(UvStatusClassifier.Classify(parts));
    }

    /// <summary>Bones and empties must not count toward the mesh tally that decides <c>partial</c>.</summary>
    [Fact]
    public void Non_mesh_parts_do_not_make_a_fully_unwrapped_asset_look_partial()
    {
        var parts = new[]
        {
            Mesh("Body", true, (0.0, 0.0, 1.0, 1.0)),
            NonMesh("Armature", "bone"),
            NonMesh("Root", "group"),
        };

        Assert.Equal(UvStatusClassifier.Unwrapped, UvStatusClassifier.Classify(parts));
    }

    /// <summary>
    /// A mesh whose UVs collapse to a single point - `SM_Env_Bridge_Underside_01` in the real
    /// library - is the extreme of the packed case, not a division by zero.
    /// </summary>
    [Fact]
    public void Uvs_collapsed_to_a_point_are_atlas_packed()
    {
        var parts = new[] { Mesh("SM_Env_Bridge_Underside_01", true, (0.5, 0.5, 0.5, 0.5)) };

        Assert.Equal(UvStatusClassifier.AtlasPacked, UvStatusClassifier.Classify(parts));
    }

    [Theory]
    [InlineData(0.49, UvStatusClassifier.AtlasPacked)]
    [InlineData(0.51, UvStatusClassifier.Unwrapped)]
    public void The_coverage_threshold_cuts_at_half_the_unit_square(double side, string expected)
    {
        // A square box of this side has area `side * side`; scale one axis so coverage lands
        // exactly either side of 0.50.
        var extent = new UvStatusClassifier.UvExtent(0, 0, side, 1.0);

        Assert.Equal(expected, UvStatusClassifier.Classify(1, 1, extent));
    }

    /// <summary>
    /// Parts with no measured bounds contribute nothing to the union rather than dragging it
    /// toward the origin, which would inflate coverage and call a packed asset unwrapped.
    /// </summary>
    [Fact]
    public void An_unmeasured_mesh_does_not_stretch_the_union_toward_the_origin()
    {
        var parts = new[]
        {
            Mesh("Packed", true, (0.9, 0.9, 0.95, 0.95)),
            Mesh("Unmeasured", true),
        };

        Assert.Equal(UvStatusClassifier.AtlasPacked, UvStatusClassifier.Classify(parts));
    }
}
