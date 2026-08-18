using Application.Abstractions;
using Application.Abstractions.Repositories;
using Application.Blender;
using Application.Extraction.Jobs;
using Application.Settings;
using Domain.Models;
using Domain.Services;
using Moq;
using Xunit;

namespace Application.Tests.Blender;

/// <summary>
/// What has to be true before a Blender operation is allowed to become a queued job.
/// Every case here is one an agent can hit by asking for something reasonable, and each
/// answer is meant to be readable without opening the queue.
/// </summary>
public class RequestBlenderOperationCommandTests
{
    private static readonly DateTime Now = new(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);

    [Fact]
    public async Task Queues_The_Operation_On_The_Active_Version()
    {
        var jobs = Jobs();
        var handler = Handler(jobs: jobs);

        var result = await handler.Handle(
            new RequestBlenderOperationCommand(42, BlenderOperations.UvUnwrap), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.False(result.Value.AlreadyQueued);
        Assert.Equal(7, result.Value.VersionId);
        jobs.Verify(r => r.AddAsync(
            It.Is<ExtractionJob>(j =>
                j.Operation == BlenderOperations.UvUnwrap &&
                j.ExtractorFamily == ExtractorFamilies.Blender &&
                j.VersionId == 7),
            It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Defaults_To_The_Active_Version_Not_The_Newest()
    {
        // An unwrap writes a new version. Defaulting to the newest would make a second
        // unwrap read the first one's output - each run compounding on the last instead of
        // being another attempt at the same source.
        var handler = Handler();

        var result = await handler.Handle(
            new RequestBlenderOperationCommand(42, BlenderOperations.UvUnwrap), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(7, result.Value.VersionId);
    }

    [Fact]
    public async Task Rejects_An_Operation_It_Cannot_Run()
    {
        var handler = Handler();

        var result = await handler.Handle(
            new RequestBlenderOperationCommand(42, "sculpt-it"), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("Blender.UnknownOperation", result.Error.Code);
    }

    [Fact]
    public async Task Says_So_Immediately_When_Blender_Is_Not_Installed()
    {
        // The alternative is a job that sits Pending forever, because the only thing that
        // could run it is not on the machine.
        var jobs = Jobs();
        var handler = Handler(jobs: jobs, blenderEnabled: false);

        var result = await handler.Handle(
            new RequestBlenderOperationCommand(42, BlenderOperations.UvUnwrap), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("Blender.NotAvailable", result.Error.Code);
        jobs.Verify(r => r.AddAsync(It.IsAny<ExtractionJob>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Rejects_A_Version_That_Belongs_To_Another_Model()
    {
        var handler = Handler();

        var result = await handler.Handle(
            new RequestBlenderOperationCommand(42, BlenderOperations.UvUnwrap, VersionId: 99),
            CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("Blender.VersionNotFound", result.Error.Code);
    }

    [Fact]
    public async Task Rejects_Parameters_Out_Of_Range_Before_Queueing_Anything()
    {
        var jobs = Jobs();
        var handler = Handler(jobs: jobs);

        var result = await handler.Handle(
            new RequestBlenderOperationCommand(
                42, BlenderOperations.UvUnwrap, ParametersJson: "{\"islandMargin\": -1}"),
            CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("Blender.InvalidParameters", result.Error.Code);
        jobs.Verify(r => r.AddAsync(It.IsAny<ExtractionJob>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Rejects_A_Parameter_That_Is_Not_A_Number()
    {
        // NaN compares false against both bounds, so a range check written as "outside"
        // would wave this through and hand Blender a string where it wants a float.
        var handler = Handler();

        var result = await handler.Handle(
            new RequestBlenderOperationCommand(
                42, BlenderOperations.UvUnwrap, ParametersJson: "{\"angleLimit\": \"steep\"}"),
            CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("Blender.InvalidParameters", result.Error.Code);
    }

    [Fact]
    public async Task Fills_In_Every_Default_When_No_Parameters_Are_Given()
    {
        var jobs = Jobs();
        var handler = Handler(jobs: jobs);

        await handler.Handle(
            new RequestBlenderOperationCommand(42, BlenderOperations.UvUnwrap), CancellationToken.None);

        jobs.Verify(r => r.AddAsync(
            It.Is<ExtractionJob>(j =>
                j.ParametersJson!.Contains("\"method\":\"smart\"") &&
                j.ParametersJson.Contains("\"angleLimit\":66") &&
                j.ParametersJson.Contains("\"channelName\":\"UVMap\"")),
            It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task A_Lightmap_Unwrap_Writes_Its_Own_Channel()
    {
        var jobs = Jobs();
        var handler = Handler(jobs: jobs);

        await handler.Handle(
            new RequestBlenderOperationCommand(
                42, BlenderOperations.UvUnwrap, ParametersJson: "{\"lightmap\": true}"),
            CancellationToken.None);

        jobs.Verify(r => r.AddAsync(
            It.Is<ExtractionJob>(j => j.ParametersJson!.Contains("\"channelName\":\"UVLightmap\"")),
            It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Asking_Twice_Costs_One_Run()
    {
        var existing = ExtractionJob.CreateOperation(
            "Model", 42, ExtractorFamilies.Blender, BlenderOperations.UvUnwrap, Now, versionId: 7);
        var jobs = Jobs();
        jobs.Setup(r => r.GetLiveJobAsync(
                "Model", 42, 7, ExtractorFamilies.Blender, BlenderOperations.UvUnwrap, It.IsAny<CancellationToken>()))
            .ReturnsAsync(existing);
        var handler = Handler(jobs: jobs);

        var result = await handler.Handle(
            new RequestBlenderOperationCommand(42, BlenderOperations.UvUnwrap), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.True(result.Value.AlreadyQueued);
        jobs.Verify(r => r.AddAsync(It.IsAny<ExtractionJob>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task A_Bake_Does_Not_Collide_With_A_Running_Unwrap()
    {
        // Dedup is per operation. Keyed on the target alone, this call would be handed the
        // unwrap's job id and nothing would ever be baked.
        var unwrap = ExtractionJob.CreateOperation(
            "Model", 42, ExtractorFamilies.Blender, BlenderOperations.UvUnwrap, Now, versionId: 7);
        var jobs = Jobs();
        jobs.Setup(r => r.GetLiveJobAsync(
                "Model", 42, 7, ExtractorFamilies.Blender, BlenderOperations.UvUnwrap, It.IsAny<CancellationToken>()))
            .ReturnsAsync(unwrap);
        var handler = Handler(jobs: jobs);

        var result = await handler.Handle(
            new RequestBlenderOperationCommand(42, BlenderOperations.BakeTextures), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.False(result.Value.AlreadyQueued);
    }

    [Fact]
    public async Task A_Bake_Defaults_To_A_Colour_And_An_Occlusion_Map()
    {
        var jobs = Jobs();
        var handler = Handler(jobs: jobs);

        await handler.Handle(
            new RequestBlenderOperationCommand(42, BlenderOperations.BakeTextures), CancellationToken.None);

        jobs.Verify(r => r.AddAsync(
            It.Is<ExtractionJob>(j =>
                j.ParametersJson!.Contains("\"maps\":[\"diffuse\",\"ao\"]") &&
                j.ParametersJson.Contains("\"resolution\":1024") &&
                j.ParametersJson.Contains("\"samples\":32") &&
                j.ParametersJson.Contains("\"unwrap\":false")),
            It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Rejects_Two_Maps_That_Would_Fight_Over_One_Channel()
    {
        // A texture set holds one texture per type. diffuse and combined both become its
        // Albedo, so the second upload would displace the first and the bake would report
        // success having quietly thrown a map away.
        var jobs = Jobs();
        var handler = Handler(jobs: jobs);

        var result = await handler.Handle(
            new RequestBlenderOperationCommand(
                42, BlenderOperations.BakeTextures,
                ParametersJson: "{\"maps\": [\"diffuse\", \"combined\"]}"),
            CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("Blender.InvalidParameters", result.Error.Code);
        Assert.Contains("Albedo", result.Error.Message);
        jobs.Verify(r => r.AddAsync(It.IsAny<ExtractionJob>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Rejects_A_Relayout_Bake_With_Nothing_To_Rebuild_The_Material_From()
    {
        // Generating a UV layout invalidates every texture the model's material samples.
        // Without a colour map the operation would succeed and hand back a grey model -
        // a worse asset than the input.
        var handler = Handler();

        var result = await handler.Handle(
            new RequestBlenderOperationCommand(
                42, BlenderOperations.BakeTextures,
                ParametersJson: "{\"maps\": [\"ao\", \"normal\"], \"unwrap\": true}"),
            CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("Blender.InvalidParameters", result.Error.Code);
        Assert.Contains("colour map", result.Error.Message);
    }

    [Fact]
    public async Task Accepts_A_Relayout_Bake_That_Carries_The_Colour_Across()
    {
        var jobs = Jobs();
        var handler = Handler(jobs: jobs);

        var result = await handler.Handle(
            new RequestBlenderOperationCommand(
                42, BlenderOperations.BakeTextures,
                ParametersJson: "{\"maps\": [\"diffuse\", \"ao\"], \"unwrap\": true}"),
            CancellationToken.None);

        Assert.True(result.IsSuccess);
        jobs.Verify(r => r.AddAsync(
            It.Is<ExtractionJob>(j => j.ParametersJson!.Contains("\"unwrap\":true")),
            It.IsAny<CancellationToken>()), Times.Once);
    }

    [Theory]
    [InlineData("{\"resolution\": 1000}")]   // not a power of two
    [InlineData("{\"resolution\": 8192}")]   // past the cap the container can hold
    [InlineData("{\"resolution\": 64}")]     // below anything usable
    [InlineData("{\"samples\": 0}")]
    [InlineData("{\"samples\": 513}")]
    [InlineData("{\"margin\": -1}")]
    [InlineData("{\"margin\": 65}")]
    [InlineData("{\"resolution\": \"big\"}")]
    public async Task Rejects_Bake_Parameters_Out_Of_Range(string parametersJson)
    {
        var jobs = Jobs();
        var handler = Handler(jobs: jobs);

        var result = await handler.Handle(
            new RequestBlenderOperationCommand(
                42, BlenderOperations.BakeTextures, ParametersJson: parametersJson),
            CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("Blender.InvalidParameters", result.Error.Code);
        jobs.Verify(r => r.AddAsync(It.IsAny<ExtractionJob>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Rejects_A_Map_Blender_Has_No_Pass_For()
    {
        var handler = Handler();

        var result = await handler.Handle(
            new RequestBlenderOperationCommand(
                42, BlenderOperations.BakeTextures, ParametersJson: "{\"maps\": [\"metallic\"]}"),
            CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Contains("metallic", result.Error.Message);
        Assert.Contains("Known maps", result.Error.Message);
    }

    [Fact]
    public async Task Drops_A_Map_Asked_For_Twice_Rather_Than_Baking_It_Twice()
    {
        var jobs = Jobs();
        var handler = Handler(jobs: jobs);

        await handler.Handle(
            new RequestBlenderOperationCommand(
                42, BlenderOperations.BakeTextures,
                ParametersJson: "{\"maps\": [\"ao\", \"AO\", \" ao \"]}"),
            CancellationToken.None);

        jobs.Verify(r => r.AddAsync(
            It.Is<ExtractionJob>(j => j.ParametersJson!.Contains("\"maps\":[\"ao\"]")),
            It.IsAny<CancellationToken>()), Times.Once);
    }

    // ---- fixtures ---------------------------------------------------------------

    private static Mock<IExtractionJobRepository> Jobs() => new();

    /// <summary>Model 42: two versions, and the ACTIVE one is the older of them.</summary>
    private static RequestBlenderOperationCommandHandler Handler(
        Mock<IExtractionJobRepository>? jobs = null,
        bool blenderEnabled = true)
    {
        var version7 = VersionFake(7, versionNumber: 1);
        var version9 = VersionFake(9, versionNumber: 2);

        var model = Model.Create("chair", Now);
        typeof(Model).GetProperty(nameof(Model.Id))!.SetValue(model, 42);
        typeof(Model).GetProperty(nameof(Model.ActiveVersionId))!.SetValue(model, 7);

        var models = new Mock<IModelRepository>();
        models.Setup(m => m.GetByIdAsync(42, It.IsAny<CancellationToken>())).ReturnsAsync(model);

        var versions = new Mock<IModelVersionRepository>();
        versions.Setup(v => v.GetByModelIdAsync(42, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { version7, version9 });
        versions.Setup(v => v.GetByIdAsync(7, It.IsAny<CancellationToken>())).ReturnsAsync(version7);
        versions.Setup(v => v.GetByIdAsync(9, It.IsAny<CancellationToken>())).ReturnsAsync(version9);
        versions.Setup(v => v.GetByIdAsync(99, It.IsAny<CancellationToken>())).ReturnsAsync((ModelVersion?)null);

        var settings = new Mock<ISettingRepository>();
        settings.Setup(s => s.GetByKeyAsync(SettingKeys.BlenderEnabled, It.IsAny<CancellationToken>()))
            .ReturnsAsync(Setting.Create(SettingKeys.BlenderEnabled, blenderEnabled ? "true" : "false", Now));

        var clock = new Mock<IDateTimeProvider>();
        clock.Setup(c => c.UtcNow).Returns(Now);

        return new RequestBlenderOperationCommandHandler(
            (jobs ?? Jobs()).Object,
            models.Object,
            versions.Object,
            settings.Object,
            clock.Object,
            new Mock<IUnitOfWork>().Object);
    }

    private static ModelVersion VersionFake(int id, int versionNumber)
    {
        var version = ModelVersion.Create(42, versionNumber, null, Now);
        typeof(ModelVersion).GetProperty(nameof(ModelVersion.Id))!.SetValue(version, id);
        return version;
    }
}
