using System.Text.Json;
using Application.Materials;
using Domain.ValueObjects;
using Xunit;

namespace Application.Tests.Materials;

/// <summary>
/// What the material DTOs actually look like on the wire.
///
/// These exist because both of these enums shipped serialized as integers while
/// every other part of the feature spoke names - the column stores text, the MCP
/// tools parse and list names, and the frontend types them as string unions. A
/// client comparing <c>kind</c> against "Material" silently took the other branch
/// and bound a parameter material as if it were a texture set; a client comparing
/// <c>alphaMode</c> against "Blend" never saw a transparent material as transparent.
/// Neither failed loudly, and no unit test could see it, because the tests fed the
/// DTOs the shape the frontend believed in.
/// </summary>
public class MaterialJsonContractTests
{
    [Theory]
    [InlineData(MaterialLibraryEntryKind.Material, "Material")]
    [InlineData(MaterialLibraryEntryKind.GlobalMaterial, "GlobalMaterial")]
    public void LibraryEntryKind_serializes_by_name(
        MaterialLibraryEntryKind kind,
        string expected)
    {
        var json = JsonSerializer.Serialize(kind);

        Assert.Equal($"\"{expected}\"", json);
    }

    [Theory]
    [InlineData(AlphaMode.Opaque, "Opaque")]
    [InlineData(AlphaMode.Mask, "Mask")]
    [InlineData(AlphaMode.Blend, "Blend")]
    public void AlphaMode_serializes_by_name(AlphaMode mode, string expected)
    {
        var json = JsonSerializer.Serialize(mode);

        Assert.Equal($"\"{expected}\"", json);
    }

    [Fact]
    public void AlphaMode_round_trips_from_its_name()
    {
        // The write path takes the name too, so a client can send back exactly
        // what it was given.
        var mode = JsonSerializer.Deserialize<AlphaMode>("\"Blend\"");

        Assert.Equal(AlphaMode.Blend, mode);
    }

    [Fact]
    public void Library_entry_carries_both_enums_by_name()
    {
        var entry = new MaterialLibraryEntryDto(
            MaterialLibraryEntryKind.Material,
            7,
            "Brushed Brass",
            null,
            null,
            null,
            RequiresUvs: false,
            PreviewGeometryType: "sphere",
            HasThumbnail: false,
            Parameters: new MaterialParametersDto(
                0.5f, 0.4f, 0.1f, 1f, "#B5892B",
                0.35f, 1f,
                0f, 0f, 0f,
                1f, 1f, 1.5f,
                AlphaMode.Blend, 0.5f, false),
            Tiling: null,
            Tags: Array.Empty<string>(),
            CreatedAt: DateTime.UnixEpoch,
            UpdatedAt: DateTime.UnixEpoch);

        var json = JsonSerializer.Serialize(entry);

        Assert.Contains("\"Material\"", json);
        Assert.Contains("\"Blend\"", json);
    }
}
