using Application.Models;
using Xunit;

namespace Application.Tests.Models;

/// <summary>
/// Reading the unbaked-rig counts out of a raw extraction payload. The worker's
/// web_bake.inspect() writes them under rollups.unbakedRig; everything here is
/// about the reader staying total - an absent, malformed or all-zero field must
/// read as "nothing to warn about", never as an exception and never as an object
/// with zeroes that the viewer would then warn about.
/// </summary>
public class ModelAnimationMetadataTests
{
    [Fact]
    public void Parse_WhenRollupsCarryUnbakedRig_BindsEveryCount()
    {
        // Lower camelCase, the shape the worker PUTs; the endpoint re-serializes
        // it PascalCase, so case-insensitive lookup is the contract.
        const string payload = """
        {
          "rollups": {
            "unbakedRig": {
              "objectConstraints": 1,
              "boneConstraints": 2,
              "ikConstraints": 1,
              "objectDrivers": 0,
              "armatureDrivers": 1,
              "shapeKeyDrivers": 1,
              "shapeKeyActions": 1,
              "droppedModifiers": ["Morph:Array (ARRAY)"],
              "hasRigFeatures": true
            }
          }
        }
        """;

        var metadata = ModelAnimationMetadata.Parse(payload);

        Assert.NotNull(metadata.UnbakedRig);
        var rig = metadata.UnbakedRig!;
        Assert.Equal(1, rig.ObjectConstraints);
        Assert.Equal(2, rig.BoneConstraints);
        Assert.Equal(1, rig.IkConstraints);
        Assert.Equal(0, rig.ObjectDrivers);
        Assert.Equal(1, rig.ArmatureDrivers);
        Assert.Equal(1, rig.ShapeKeyDrivers);
        Assert.Equal(1, rig.ShapeKeyActions);
        Assert.Equal(new[] { "Morph:Array (ARRAY)" }, rig.DroppedModifiers);
        Assert.True(rig.HasRigFeatures);
    }

    [Fact]
    public void Parse_WhenTheEndpointReserializedItPascalCase_StillBinds()
    {
        // What ImportModelSceneGraphCommand actually stores: the deserialized
        // request re-serialized with default options.
        const string payload = """
        {
          "Rollups": {
            "UnbakedRig": { "ObjectConstraints": 1, "BoneConstraints": 1 }
          }
        }
        """;

        var metadata = ModelAnimationMetadata.Parse(payload);

        Assert.NotNull(metadata.UnbakedRig);
        Assert.Equal(1, metadata.UnbakedRig!.ObjectConstraints);
    }

    [Fact]
    public void Parse_WhenThereIsNoUnbakedRig_ReadsNothing()
    {
        const string payload = """
        { "rollups": { "animations": [] }, "parts": [] }
        """;

        Assert.Null(ModelAnimationMetadata.Parse(payload).UnbakedRig);
    }

    [Fact]
    public void Parse_WhenEveryCountIsZero_ReadsNothing()
    {
        // A payload with zeroes means "checked, nothing found". Returning an
        // object would make the viewer show a warning about a file with no rig
        // features at all.
        const string payload = """
        {
          "rollups": {
            "unbakedRig": {
              "objectConstraints": 0, "boneConstraints": 0, "ikConstraints": 0,
              "objectDrivers": 0, "armatureDrivers": 0, "shapeKeyDrivers": 0,
              "shapeKeyActions": 0, "droppedModifiers": []
            }
          }
        }
        """;

        Assert.Null(ModelAnimationMetadata.Parse(payload).UnbakedRig);
    }

    [Fact]
    public void Parse_WhenUnbakedRigIsNotAnObject_ReadsNothingRatherThanThrowing()
    {
        const string payload = """
        { "rollups": { "unbakedRig": "yes" } }
        """;

        Assert.Null(ModelAnimationMetadata.Parse(payload).UnbakedRig);
    }

    [Fact]
    public void Parse_WhenThePayloadIsNotJson_ReadsEmpty()
    {
        var metadata = ModelAnimationMetadata.Parse("{not json");

        Assert.Empty(metadata.Animations);
        Assert.Empty(metadata.ShapeKeys);
        Assert.Null(metadata.UnbakedRig);
    }
}
