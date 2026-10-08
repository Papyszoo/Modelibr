using System.Text.Json;
using Application.Vfx;
using Xunit;

namespace Application.Tests.Vfx;

/// <summary>
/// The v1 definition contract. What matters here is that a rejected definition names
/// every problem it found, each at the full path of the field, because an agent fixes
/// one round of problems per turn.
/// </summary>
public class VfxDefinitionValidationTests
{
    private const string Valid = """
        {"version":1,"duration":4,"loop":true,"components":[
          {"id":"sparks","type":"particles","name":"Sparks","start":0,"duration":2,"position":[0,0,0],
           "particles":{"mode":"burst","rate":10,"count":100,"lifetime":1,"speed":3,"spread":30,
             "gravity":-9.8,"sizeStart":0.2,"sizeEnd":0,"colorStart":"#ffcc66","colorEnd":"#ff3300",
             "opacityStart":1,"opacityEnd":0,"blending":"additive","spriteId":7,"seed":1}},
          {"id":"rock","type":"mesh","name":"Rock","start":0,"duration":2,
           "mesh":{"modelId":12,"versionId":34},
           "tracks":{"scale":[[0,1],[0.5,2]],"opacity":[[0,1],[1,0]],"rotationY":[[0,0],[1,360]]}},
          {"id":"glow","type":"light","name":"Glow","start":1,"duration":2,
           "light":{"color":"#ffaa55","range":5},"tracks":{"intensity":[[0,0],[0.1,5]]}},
          {"id":"boom","type":"sound","name":"Boom","start":0,"duration":1,
           "sound":{"soundId":9,"volume":0.8}}
        ]}
        """;

    private static VfxDefinitionRead Read(string json) =>
        VfxDefinition.Read(JsonSerializer.Deserialize<JsonElement>(json));

    private static VfxProblem ProblemAt(VfxDefinitionRead read, string path) =>
        Assert.Single(read.Problems, p => p.Path == path);

    [Fact]
    public void A_Valid_Definition_Passes()
    {
        var read = Read(Valid);

        Assert.Empty(read.Problems);
        Assert.True(read.IsValid);
    }

    [Fact]
    public void A_Missing_Definition_Falls_Back_To_The_Default()
    {
        var read = VfxDefinition.Read(null);

        Assert.True(read.IsValid);
        Assert.Equal(1, read.Definition.GetProperty("version").GetInt32());
        Assert.Equal(2, read.Definition.GetProperty("duration").GetDouble());
        Assert.False(read.Definition.GetProperty("loop").GetBoolean());
        Assert.Empty(read.Definition.GetProperty("components").EnumerateArray());
    }

    [Fact]
    public void An_Unknown_Component_Type_Names_Its_Path()
    {
        var json = Valid.Replace("\"type\":\"particles\"", "\"type\":\"sparks\"");

        var read = Read(json);

        Assert.Equal("must be one of particles, mesh, light or sound.",
            ProblemAt(read, "components[0].type").Message);
    }

    [Fact]
    public void A_Missing_Type_Block_Names_Its_Path()
    {
        const string json = """
            {"version":1,"duration":2,"loop":false,"components":[
              {"id":"a","type":"particles","name":"A","start":0,"duration":1}]}
            """;

        var read = Read(json);

        Assert.Equal("is required for a particles component.",
            ProblemAt(read, "components[0].particles").Message);
    }

    [Fact]
    public void An_Extra_Type_Block_Names_Its_Path()
    {
        const string json = """
            {"version":1,"duration":2,"loop":false,"components":[
              {"id":"a","type":"particles","name":"A","start":0,"duration":1,
               "particles":{"mode":"burst","rate":1,"count":1,"lifetime":1,"speed":1,"spread":10,
                 "gravity":0,"sizeStart":1,"sizeEnd":1,"colorStart":"#ffffff","colorEnd":"#000000",
                 "opacityStart":1,"opacityEnd":0,"blending":"normal","seed":1},
               "mesh":{"modelId":1}}]}
            """;

        var read = Read(json);

        Assert.Equal("is only allowed on a mesh component.",
            ProblemAt(read, "components[0].mesh").Message);
    }

    [Fact]
    public void A_Disallowed_Track_Names_Its_Path()
    {
        const string json = """
            {"version":1,"duration":2,"loop":false,"components":[
              {"id":"a","type":"particles","name":"A","start":0,"duration":1,
               "particles":{"mode":"burst","rate":1,"count":1,"lifetime":1,"speed":1,"spread":10,
                 "gravity":0,"sizeStart":1,"sizeEnd":1,"colorStart":"#ffffff","colorEnd":"#000000",
                 "opacityStart":1,"opacityEnd":0,"blending":"normal","seed":1},
               "tracks":{"scale":[[0,1]]}}]}
            """;

        var read = Read(json);

        Assert.Equal("is not allowed on a particles component.",
            ProblemAt(read, "components[0].tracks.scale").Message);
    }

    [Fact]
    public void A_Particles_Range_Rule_Names_The_Exact_Field()
    {
        var json = Valid.Replace("\"rate\":10", "\"rate\":5000");

        var read = Read(json);

        Assert.Equal("must be at most 2000.", ProblemAt(read, "components[0].particles.rate").Message);
    }

    private static string Particles(string mode, string emission) => $$$"""
        {"version":1,"duration":2,"loop":false,"components":[
          {"id":"sparks","type":"particles","name":"Sparks","start":0,"duration":1,
           "particles":{"mode":"{{{mode}}}",{{{emission}}}"lifetime":1,"speed":1,"spread":10,
             "gravity":0,"sizeStart":1,"sizeEnd":1,"colorStart":"#ffffff","colorEnd":"#000000",
             "opacityStart":1,"opacityEnd":0,"blending":"normal","seed":1}}]}
        """;

    [Fact]
    public void Continuous_Particles_Without_Count_Pass()
    {
        var read = Read(Particles("continuous", "\"rate\":10,"));

        Assert.Empty(read.Problems);
        Assert.True(read.IsValid);
    }

    [Fact]
    public void Burst_Particles_Without_Rate_Pass()
    {
        var read = Read(Particles("burst", "\"count\":100,"));

        Assert.Empty(read.Problems);
        Assert.True(read.IsValid);
    }

    [Fact]
    public void Continuous_Particles_Without_Rate_Name_The_Path()
    {
        var read = Read(Particles("continuous", "\"count\":100,"));

        Assert.Equal("is required.", ProblemAt(read, "components[0].particles.rate").Message);
    }

    [Fact]
    public void An_Optional_Emission_Parameter_Is_Still_Range_Checked()
    {
        var read = Read(Particles("continuous", "\"rate\":10,\"count\":0,"));

        Assert.Equal("must be 1 or greater.", ProblemAt(read, "components[0].particles.count").Message);
    }

    [Fact]
    public void A_Component_Running_Past_The_Effect_Names_Its_Duration()
    {
        var json = Valid.Replace("\"start\":1,\"duration\":2", "\"start\":3,\"duration\":2");

        var read = Read(json);

        Assert.Equal("start + duration exceeds the effect duration.",
            ProblemAt(read, "components[2].duration").Message);
    }

    [Fact]
    public void A_Duplicate_Component_Id_Names_The_Second_One()
    {
        var json = Valid.Replace("\"id\":\"rock\"", "\"id\":\"sparks\"");

        var read = Read(json);

        Assert.Equal("'sparks' is already used by another component.",
            ProblemAt(read, "components[1].id").Message);
    }

    [Fact]
    public void A_Malformed_Colour_Names_The_Exact_Field()
    {
        var json = Valid.Replace("\"colorStart\":\"#ffcc66\"", "\"colorStart\":\"orange\"");

        var read = Read(json);

        Assert.Equal("must be a colour in #rrggbb format.",
            ProblemAt(read, "components[0].particles.colorStart").Message);
    }

    [Fact]
    public void An_Out_Of_Range_Effect_Duration_Names_The_Top_Field()
    {
        var json = Valid.Replace("\"duration\":4,", "\"duration\":90,");

        var read = Read(json);

        Assert.Equal("must be between 0.1 and 60 seconds.",
            ProblemAt(read, "duration").Message);
    }

    [Fact]
    public void An_Out_Of_Range_Track_Value_Names_The_Keyframe()
    {
        var json = Valid.Replace("\"opacity\":[[0,1],[1,0]]", "\"opacity\":[[0,2],[1,0]]");

        var read = Read(json);

        Assert.Equal("must be between 0 and 1.",
            ProblemAt(read, "components[1].tracks.opacity[0][1]").Message);
    }

    [Fact]
    public void Every_Problem_Is_Reported_At_Once()
    {
        const string json = """
            {"version":2,"duration":90,"loop":"yes","components":[
              {"id":"A","type":"nope","name":"","start":-1,"duration":0}]}
            """;

        var read = Read(json);

        Assert.Contains(read.Problems, p => p.Path == "version");
        Assert.Contains(read.Problems, p => p.Path == "duration");
        Assert.Contains(read.Problems, p => p.Path == "loop");
        Assert.Contains(read.Problems, p => p.Path == "components[0].id");
        Assert.Contains(read.Problems, p => p.Path == "components[0].type");
        Assert.Contains(read.Problems, p => p.Path == "components[0].name");
        Assert.Contains(read.Problems, p => p.Path == "components[0].start");
        Assert.Contains(read.Problems, p => p.Path == "components[0].duration");
    }

    [Fact]
    public void Too_Many_Components_Names_The_Array()
    {
        var components = string.Join(",", Enumerable.Range(0, 33)
            .Select(i => "{\"id\":\"c" + i + "\",\"type\":\"light\",\"name\":\"L\",\"start\":0,\"duration\":1,\"light\":{\"color\":\"#ffffff\",\"range\":1}}"));
        var json = $$"""{"version":1,"duration":2,"loop":false,"components":[{{components}}]}""";

        var read = Read(json);

        Assert.Equal("must have at most 32 components.", ProblemAt(read, "components").Message);
    }

    [Fact]
    public void ExtractReferences_Reports_Every_Library_Id_With_Its_Path()
    {
        var read = Read(Valid);

        var references = VfxDefinition.ExtractReferences(read.Definition);

        Assert.Contains(references, r => r is { Path: "components[0].particles.spriteId", Kind: VfxAssetKind.Sprite, Id: 7 });
        Assert.Contains(references, r => r is { Path: "components[1].mesh.modelId", Kind: VfxAssetKind.Model, Id: 12 });
        Assert.Contains(references, r => r is { Path: "components[1].mesh.versionId", Kind: VfxAssetKind.ModelVersion, Id: 34 });
        Assert.Contains(references, r => r is { Path: "components[3].sound.soundId", Kind: VfxAssetKind.Sound, Id: 9 });
    }

    [Fact]
    public void Summarize_Reports_Duration_Count_And_Distinct_Types()
    {
        var summary = VfxDefinition.Summarize(Valid);

        Assert.Equal(4, summary.Duration);
        Assert.Equal(4, summary.ComponentCount);
        Assert.Equal(["particles", "mesh", "light", "sound"], summary.ComponentTypes);
    }
}
