using System.Text.Json;
using Application.Models;
using Xunit;

namespace Application.Tests.Models;

/// <summary>
/// The wire contract with the worker's scene-graph payload: the minimal API binds
/// with web defaults, so casing is free but the field names are not.
/// </summary>
public class SceneGraphRollupsDtoTests
{
    [Fact]
    public void Deserialize_WhenWorkerSendsAnimations_BindsClipMetadata()
    {
        const string json = """
        {
          "meshCount": 1,
          "animationCount": 1,
          "animationNames": ["Wave"],
          "animations": [
            { "name": "Wave", "durationSeconds": 1, "kinds": ["skeletal"] }
          ]
        }
        """;

        var rollups = JsonSerializer.Deserialize<SceneGraphRollupsDto>(
            json, new JsonSerializerOptions(JsonSerializerDefaults.Web));

        Assert.NotNull(rollups);
        var clip = Assert.Single(rollups!.Animations!);
        Assert.Equal("Wave", clip.Name);
        Assert.Equal(1, clip.DurationSeconds);
        Assert.Equal(new[] { "skeletal" }, clip.Kinds);
    }

    [Fact]
    public void Deserialize_WhenWorkerSendsUnbakedRig_BindsTheCounts()
    {
        const string json = """
        {
          "meshCount": 1,
          "unbakedRig": {
            "objectConstraints": 1,
            "boneConstraints": 1,
            "ikConstraints": 1,
            "shapeKeyDrivers": 1,
            "shapeKeyActions": 1,
            "droppedModifiers": ["Morph:Array (ARRAY)"],
            "hasRigFeatures": true
          }
        }
        """;

        var rollups = JsonSerializer.Deserialize<SceneGraphRollupsDto>(
            json, new JsonSerializerOptions(JsonSerializerDefaults.Web));

        Assert.NotNull(rollups?.UnbakedRig);
        Assert.Equal(1, rollups!.UnbakedRig!.ObjectConstraints);
        Assert.Equal(1, rollups.UnbakedRig.IkConstraints);
        Assert.Equal(new[] { "Morph:Array (ARRAY)" }, rollups.UnbakedRig.DroppedModifiers);
        Assert.True(rollups.UnbakedRig.HasRigFeatures);
    }
}
