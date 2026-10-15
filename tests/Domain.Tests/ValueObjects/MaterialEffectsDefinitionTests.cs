using System.Text.Json;
using Domain.ValueObjects;
using Xunit;

namespace Domain.Tests.ValueObjects;

/// <summary>
/// The v1 material-effects contract. What matters here is that a rejected document names
/// every problem at the full path of the field, because an agent fixes one round of
/// problems per turn - and that every range from the spec is enforced at both edges.
/// </summary>
public class MaterialEffectsDefinitionTests
{
    private const string SpecExample = """
        {
          "version": 1,
          "effects": [
            { "type": "jelly_wobble", "amplitude": 0.03, "frequency": 1.5, "waveScale": 4.0, "seed": 0,
              "drivers": { "amplitude": { "input": "speed", "scale": 0.02 } } },
            { "type": "rim", "color": "#7CFF2A", "power": 3.0, "intensity": 1.0 },
            { "type": "translucency", "interiorColor": "#2E5A12", "thickness": 0.6 },
            { "type": "emission_pulse", "color": "#CCFF66", "intensity": 0.0, "rate": 2.0,
              "drivers": { "intensity": { "input": "charge", "scale": 4.0 } } }
          ],
          "previewInputs": { "speed": 0, "impulse": 0, "charge": 0 }
        }
        """;

    private static MaterialEffectsRead Read(string json) =>
        MaterialEffectsDefinition.Read(JsonSerializer.Deserialize<JsonElement>(json));

    private static MaterialEffectsRead ReadEffects(params object[] effects) =>
        MaterialEffectsDefinition.Read(JsonSerializer.SerializeToElement(new { version = 1, effects }));

    private static MaterialEffectsRead OneEffect(string type, params (string Name, object Value)[] fields)
    {
        var effect = new Dictionary<string, object> { ["type"] = type };
        foreach (var (name, value) in fields)
            effect[name] = value;

        return ReadEffects(effect);
    }

    private static void AssertParam(
        string type, string parameter, object value, bool invalid,
        params (string Name, object Value)[] rest)
    {
        var read = OneEffect(type, [(parameter, value), .. rest]);

        Assert.Equal(!invalid, read.IsValid);
        if (invalid)
            Assert.Contains(read.Problems, p => p.Path == $"effects[0].{parameter}");
    }

    // ── The whole document ─────────────────────────────────────────────────────

    [Fact]
    public void The_Spec_Example_Is_Valid()
    {
        var read = Read(SpecExample);

        Assert.True(read.IsValid);
        Assert.NotNull(read.Definition);
    }

    [Fact]
    public void A_Null_Input_Means_No_Effects()
    {
        var read = MaterialEffectsDefinition.Read(null);

        Assert.True(read.IsValid);
        Assert.Null(read.Definition);
    }

    [Fact]
    public void A_JSON_String_Holding_The_Document_Is_Accepted()
    {
        // An MCP client that cannot express an object still reaches the same contract.
        var read = MaterialEffectsDefinition.Read(JsonSerializer.SerializeToElement(SpecExample));

        Assert.True(read.IsValid);
        Assert.NotNull(read.Definition);
    }

    [Fact]
    public void A_Non_Object_Input_Names_The_Top_Field()
    {
        var read = MaterialEffectsDefinition.Read(JsonSerializer.SerializeToElement(new[] { 1, 2 }));

        Assert.False(read.IsValid);
        Assert.Contains(read.Problems, p => p.Path == "effects" && p.Message == "must be a JSON object.");
    }

    // ── Version and shape ──────────────────────────────────────────────────────

    [Fact]
    public void A_Bad_Version_Is_Rejected()
    {
        var read = Read("""{"version":2,"effects":[]}""");

        Assert.False(read.IsValid);
        Assert.Contains(read.Problems, p => p.Path == "version" && p.Message == "must be 1.");
    }

    [Fact]
    public void A_Missing_Version_Is_Rejected()
    {
        var read = Read("""{"effects":[]}""");

        Assert.Contains(read.Problems, p => p.Path == "version" && p.Message == "is required.");
    }

    [Fact]
    public void A_Missing_Effects_Array_Is_Rejected()
    {
        var read = Read("""{"version":1}""");

        Assert.Contains(read.Problems, p => p.Path == "effects" && p.Message == "is required.");
    }

    [Fact]
    public void Five_Effects_Are_Rejected()
    {
        var read = ReadEffects(
            new { type = "jelly_wobble", amplitude = 0.1, frequency = 1.0, waveScale = 1.0, seed = 0 },
            new { type = "rim", color = "#ffffff", power = 1.0, intensity = 1.0 },
            new { type = "translucency", interiorColor = "#ffffff", thickness = 0.5 },
            new { type = "emission_pulse", color = "#ffffff", intensity = 0.5, rate = 1.0 },
            new { type = "rim", color = "#ffffff", power = 1.0, intensity = 1.0 });

        Assert.Contains(read.Problems, p => p.Path == "effects" && p.Message == "must have at most 4 effects.");
    }

    [Fact]
    public void A_Duplicate_Effect_Type_Is_Rejected_At_The_Second_One()
    {
        var read = ReadEffects(
            new { type = "rim", color = "#ffffff", power = 1.0, intensity = 1.0 },
            new { type = "rim", color = "#000000", power = 2.0, intensity = 2.0 });

        Assert.False(read.IsValid);
        Assert.Equal("'rim' is already used by another effect.",
            Assert.Single(read.Problems, p => p.Path == "effects[1].type").Message);
    }

    [Fact]
    public void An_Unknown_Effect_Type_Is_Rejected()
    {
        var read = ReadEffects(new { type = "sparkle", color = "#ffffff" });

        Assert.Contains(read.Problems, p =>
            p.Path == "effects[0].type"
            && p.Message == "must be one of jelly_wobble, rim, translucency or emission_pulse.");
    }

    // ── jelly_wobble ranges ────────────────────────────────────────────────────

    [Theory]
    [InlineData(-0.01, true)]
    [InlineData(0.0, false)]
    [InlineData(0.5, false)]
    [InlineData(0.51, true)]
    public void JellyWobble_Amplitude_Is_Bounded(double value, bool invalid) =>
        AssertParam("jelly_wobble", "amplitude", value, invalid, ("frequency", 1.5), ("waveScale", 4.0), ("seed", 0));

    [Theory]
    [InlineData(-0.01, true)]
    [InlineData(0.0, false)]
    [InlineData(10.0, false)]
    [InlineData(10.01, true)]
    public void JellyWobble_Frequency_Is_Bounded(double value, bool invalid) =>
        AssertParam("jelly_wobble", "frequency", value, invalid, ("amplitude", 0.1), ("waveScale", 4.0), ("seed", 0));

    [Theory]
    [InlineData(-0.01, true)]
    [InlineData(0.0, false)]
    [InlineData(20.0, false)]
    [InlineData(20.01, true)]
    public void JellyWobble_WaveScale_Is_Bounded(double value, bool invalid) =>
        AssertParam("jelly_wobble", "waveScale", value, invalid, ("amplitude", 0.1), ("frequency", 1.5), ("seed", 0));

    [Theory]
    [InlineData(-1, true)]
    [InlineData(0, false)]
    [InlineData(1000, false)]
    [InlineData(1001, true)]
    public void JellyWobble_Seed_Is_Bounded(int value, bool invalid) =>
        AssertParam("jelly_wobble", "seed", value, invalid, ("amplitude", 0.1), ("frequency", 1.5), ("waveScale", 4.0));

    [Fact]
    public void JellyWobble_Seed_Must_Be_An_Integer()
    {
        var read = OneEffect("jelly_wobble",
            ("amplitude", 0.1), ("frequency", 1.5), ("waveScale", 4.0), ("seed", 0.5));

        Assert.Contains(read.Problems, p => p.Path == "effects[0].seed" && p.Message == "must be an integer.");
    }

    // ── rim ranges ─────────────────────────────────────────────────────────────

    [Theory]
    [InlineData(0.49, true)]
    [InlineData(0.5, false)]
    [InlineData(8.0, false)]
    [InlineData(8.01, true)]
    public void Rim_Power_Is_Bounded(double value, bool invalid) =>
        AssertParam("rim", "power", value, invalid, ("color", "#ffffff"), ("intensity", 1.0));

    [Theory]
    [InlineData(-0.01, true)]
    [InlineData(0.0, false)]
    [InlineData(10.0, false)]
    [InlineData(10.01, true)]
    public void Rim_Intensity_Is_Bounded(double value, bool invalid) =>
        AssertParam("rim", "intensity", value, invalid, ("color", "#ffffff"), ("power", 3.0));

    // ── translucency ranges ────────────────────────────────────────────────────

    [Theory]
    [InlineData(-0.01, true)]
    [InlineData(0.0, false)]
    [InlineData(1.0, false)]
    [InlineData(1.01, true)]
    public void Translucency_Thickness_Is_Bounded(double value, bool invalid) =>
        AssertParam("translucency", "thickness", value, invalid, ("interiorColor", "#2E5A12"));

    // ── emission_pulse ranges ──────────────────────────────────────────────────

    [Theory]
    [InlineData(-0.01, true)]
    [InlineData(0.0, false)]
    [InlineData(10.0, false)]
    [InlineData(10.01, true)]
    public void EmissionPulse_Intensity_Is_Bounded(double value, bool invalid) =>
        AssertParam("emission_pulse", "intensity", value, invalid, ("color", "#CCFF66"), ("rate", 2.0));

    [Theory]
    [InlineData(-0.01, true)]
    [InlineData(0.0, false)]
    [InlineData(20.0, false)]
    [InlineData(20.01, true)]
    public void EmissionPulse_Rate_Is_Bounded(double value, bool invalid) =>
        AssertParam("emission_pulse", "rate", value, invalid, ("color", "#CCFF66"), ("intensity", 1.0));

    // ── Colours ────────────────────────────────────────────────────────────────

    [Theory]
    [InlineData("orange")]
    [InlineData("#FFF")]
    [InlineData("#GGGGGG")]
    [InlineData("7CFF2A")]
    public void Rim_Colour_Must_Be_Hex(string color)
    {
        var read = OneEffect("rim", ("color", color), ("power", 3.0), ("intensity", 1.0));

        Assert.Contains(read.Problems, p =>
            p.Path == "effects[0].color" && p.Message == "must be a colour in #rrggbb format.");
    }

    [Theory]
    [InlineData("rim", "color")]
    [InlineData("translucency", "interiorColor")]
    [InlineData("emission_pulse", "color")]
    public void Every_Effect_Colour_Is_Checked(string type, string field)
    {
        var read = OneEffect(type, (field, "not-a-colour"));

        Assert.Contains(read.Problems, p => p.Path == $"effects[0].{field}");
    }

    // ── Drivers ────────────────────────────────────────────────────────────────

    [Theory]
    [InlineData("speed", false)]
    [InlineData("impulse", false)]
    [InlineData("charge", false)]
    [InlineData("bass", true)]
    public void Driver_Input_Is_One_Of_The_Three_Inputs(string input, bool invalid)
    {
        var read = OneEffect("rim",
            ("color", "#ffffff"), ("power", 3.0), ("intensity", 1.0),
            ("drivers", new Dictionary<string, object> { ["intensity"] = new { input, scale = 2.0 } }));

        Assert.Equal(!invalid, read.IsValid);
        if (invalid)
            Assert.Contains(read.Problems, p =>
                p.Path == "effects[0].drivers.intensity.input"
                && p.Message == "must be one of speed, impulse or charge.");
    }

    [Theory]
    [InlineData(-100.1, true)]
    [InlineData(-100.0, false)]
    [InlineData(100.0, false)]
    [InlineData(100.1, true)]
    public void Driver_Scale_Is_Bounded(double scale, bool invalid)
    {
        var read = OneEffect("rim",
            ("color", "#ffffff"), ("power", 3.0), ("intensity", 1.0),
            ("drivers", new Dictionary<string, object> { ["intensity"] = new { input = "speed", scale } }));

        Assert.Equal(!invalid, read.IsValid);
        if (invalid)
            Assert.Contains(read.Problems, p => p.Path == "effects[0].drivers.intensity.scale");
    }

    [Fact]
    public void A_Driver_On_A_Non_Numeric_Parameter_Is_Rejected()
    {
        // seed is an integer, not a numeric parameter a driver may modulate.
        var read = OneEffect("jelly_wobble",
            ("amplitude", 0.1), ("frequency", 1.5), ("waveScale", 4.0), ("seed", 0),
            ("drivers", new Dictionary<string, object> { ["seed"] = new { input = "speed", scale = 1.0 } }));

        Assert.Contains(read.Problems, p =>
            p.Path == "effects[0].drivers.seed"
            && p.Message == "is not a numeric parameter of a jelly_wobble effect.");
    }

    [Fact]
    public void A_Driver_Without_An_Input_Is_Rejected()
    {
        var read = OneEffect("rim",
            ("color", "#ffffff"), ("power", 3.0), ("intensity", 1.0),
            ("drivers", new Dictionary<string, object> { ["intensity"] = new { scale = 2.0 } }));

        Assert.Contains(read.Problems, p =>
            p.Path == "effects[0].drivers.intensity.input" && p.Message == "is required.");
    }

    [Fact]
    public void A_Driver_Without_A_Scale_Is_Rejected()
    {
        var read = OneEffect("rim",
            ("color", "#ffffff"), ("power", 3.0), ("intensity", 1.0),
            ("drivers", new Dictionary<string, object> { ["intensity"] = new { input = "speed" } }));

        Assert.Contains(read.Problems, p =>
            p.Path == "effects[0].drivers.intensity.scale" && p.Message == "is required.");
    }

    // ── previewInputs ──────────────────────────────────────────────────────────

    [Theory]
    [InlineData("speed", -0.01, true)]
    [InlineData("speed", 0.0, false)]
    [InlineData("speed", 20.0, false)]
    [InlineData("speed", 20.01, true)]
    [InlineData("impulse", -0.01, true)]
    [InlineData("impulse", 0.0, false)]
    [InlineData("impulse", 1.0, false)]
    [InlineData("impulse", 1.01, true)]
    [InlineData("charge", -0.01, true)]
    [InlineData("charge", 0.0, false)]
    [InlineData("charge", 1.0, false)]
    [InlineData("charge", 1.01, true)]
    public void PreviewInputs_Are_Bounded(string name, double value, bool invalid)
    {
        var read = MaterialEffectsDefinition.Read(
            JsonSerializer.SerializeToElement(new { version = 1, effects = Array.Empty<object>(), previewInputs = new Dictionary<string, object> { [name] = value } }));

        Assert.Equal(!invalid, read.IsValid);
        if (invalid)
            Assert.Contains(read.Problems, p => p.Path == $"previewInputs.{name}");
    }

    [Fact]
    public void An_Unknown_Preview_Input_Is_Rejected()
    {
        var read = MaterialEffectsDefinition.Read(
            JsonSerializer.SerializeToElement(new { version = 1, effects = Array.Empty<object>(), previewInputs = new { rumble = 1.0 } }));

        Assert.Contains(read.Problems, p =>
            p.Path == "previewInputs.rumble"
            && p.Message == "is not a preview input; expected speed, impulse or charge.");
    }

    [Fact]
    public void Every_Problem_Is_Reported_At_Once()
    {
        var read = Read("""
            {"version":2,"effects":[
              {"type":"jelly_wobble","amplitude":9,"frequency":-1,"waveScale":30,"seed":7.5},
              {"type":"rim","color":"orange","power":0.1,"intensity":99},
              {"type":"translucency","interiorColor":"#2E5A12","thickness":2},
              {"type":"emission_pulse","color":"#CCFF66","intensity":1,"rate":50},
              {"type":"rim","color":"#ffffff","power":3,"intensity":1}]}
            """);

        Assert.Contains(read.Problems, p => p.Path == "version");
        Assert.Contains(read.Problems, p => p.Path == "effects[0].amplitude");
        Assert.Contains(read.Problems, p => p.Path == "effects[0].frequency");
        Assert.Contains(read.Problems, p => p.Path == "effects[0].waveScale");
        Assert.Contains(read.Problems, p => p.Path == "effects[0].seed");
        Assert.Contains(read.Problems, p => p.Path == "effects[1].color");
        Assert.Contains(read.Problems, p => p.Path == "effects[1].power");
        Assert.Contains(read.Problems, p => p.Path == "effects[1].intensity");
        Assert.Contains(read.Problems, p => p.Path == "effects[2].thickness");
        Assert.Contains(read.Problems, p => p.Path == "effects[3].rate");
        Assert.Contains(read.Problems, p => p.Path == "effects");
        Assert.Contains(read.Problems, p => p.Path == "effects[4].type");
    }
}
