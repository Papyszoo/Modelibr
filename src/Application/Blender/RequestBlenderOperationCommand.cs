using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Extraction.Jobs;
using Application.Settings;
using Domain.Models;
using Domain.Services;
using SharedKernel;

namespace Application.Blender;

/// <summary>
/// Asks for a Blender operation on a model version. Returns the job id immediately -
/// unwrapping is seconds and baking is minutes, so nothing waits here.
/// </summary>
/// <remarks>
/// Everything knowable before the work starts is checked before the work is queued:
/// whether Blender is installed at all, whether the model and version exist, whether the
/// operation is one we run, and whether its parameters are in range. A queue is a bad
/// place to discover a typo - the caller would get a job id, poll it, and be told three
/// minutes later that a margin was negative.
/// </remarks>
internal sealed class RequestBlenderOperationCommandHandler
    : ICommandHandler<RequestBlenderOperationCommand, BlenderOperationRequested>
{
    private readonly IExtractionJobRepository _jobRepository;
    private readonly IModelRepository _modelRepository;
    private readonly IModelVersionRepository _modelVersionRepository;
    private readonly ISettingRepository _settingRepository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IUnitOfWork _unitOfWork;

    public RequestBlenderOperationCommandHandler(
        IExtractionJobRepository jobRepository,
        IModelRepository modelRepository,
        IModelVersionRepository modelVersionRepository,
        ISettingRepository settingRepository,
        IDateTimeProvider dateTimeProvider,
        IUnitOfWork unitOfWork)
    {
        _jobRepository = jobRepository;
        _modelRepository = modelRepository;
        _modelVersionRepository = modelVersionRepository;
        _settingRepository = settingRepository;
        _dateTimeProvider = dateTimeProvider;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result<BlenderOperationRequested>> Handle(
        RequestBlenderOperationCommand command,
        CancellationToken cancellationToken)
    {
        var operation = command.Operation?.Trim() ?? string.Empty;
        if (!BlenderOperations.IsKnown(operation))
        {
            return Result.Failure<BlenderOperationRequested>(new Error(
                "Blender.UnknownOperation",
                $"Unknown Blender operation '{operation}'. Known operations: {string.Join(", ", BlenderOperations.All)}."));
        }

        // Blender is an optional install. Saying so here is the difference between an
        // immediate, actionable answer and a job that sits Pending forever because the
        // only thing that could run it is not there.
        var enabled = await _settingRepository.GetByKeyAsync(SettingKeys.BlenderEnabled, cancellationToken);
        if (!bool.TryParse(enabled?.Value, out var blenderEnabled) || !blenderEnabled)
        {
            return Result.Failure<BlenderOperationRequested>(new Error(
                "Blender.NotAvailable",
                "Blender is not installed or is disabled. Install a Blender version in Settings, then ask again."));
        }

        var model = await _modelRepository.GetByIdAsync(command.ModelId, cancellationToken);
        if (model is null)
        {
            return Result.Failure<BlenderOperationRequested>(new Error(
                "Blender.ModelNotFound", $"Model {command.ModelId} was not found."));
        }

        var versionResult = await ResolveVersionAsync(model, command.VersionId, cancellationToken);
        if (versionResult.IsFailure)
        {
            return Result.Failure<BlenderOperationRequested>(versionResult.Error);
        }
        var version = versionResult.Value;

        var parameters = BlenderOperationSpecs.NormalizeParameters(operation, command.ParametersJson);
        if (parameters.IsFailure)
        {
            return Result.Failure<BlenderOperationRequested>(parameters.Error);
        }

        // Deduped per operation, not per target: a version can be unwrapped while a bake of
        // it is still queued, and neither should hand back the other's job id.
        var existing = await _jobRepository.GetLiveJobAsync(
            "Model", model.Id, version.Id, ExtractorFamilies.Blender, operation, cancellationToken);
        if (existing is not null)
        {
            // A conversion is the one operation whose parameters change WHAT is produced
            // rather than how well. Two unwraps of a version differing in margin are two
            // attempts at one result, and handing back the live job is a fair answer; a
            // convert to glb and a convert to fbx are two different files, and handing back
            // the glb job's id would silently give the caller a format it did not ask for.
            // The dedup key is (operation, version) and widening it is a schema change, so
            // the ambiguity is refused here instead of being answered wrongly.
            if (operation == BlenderOperations.ConvertFormat)
            {
                var live = BlenderOperationSpecs.ConvertTarget(existing.ParametersJson);
                var wanted = BlenderOperationSpecs.ConvertTarget(parameters.Value);

                // `wanted` came out of the validator a line ago, so it is never null. A null
                // `live` means the live job's parameters cannot be read at all - a row from
                // before this operation was validated - and that is a reason to refuse, not
                // to treat it as a match. Requiring both to be non-null before comparing sent
                // exactly the unintelligible case down the AlreadyQueued path, handing the
                // caller a job id for a format nobody can name.
                if (!string.Equals(live, wanted, StringComparison.Ordinal))
                {
                    return Result.Failure<BlenderOperationRequested>(new Error(
                        "Blender.ConversionInFlight",
                        live is null
                            ? $"Version {version.Id} already has conversion job {existing.Id} queued and its target " +
                              $"format cannot be read, so it cannot be told apart from a request for {wanted}. " +
                              "Wait for that job to finish (get_job_status), then ask again."
                            : $"Version {version.Id} is already being converted to {live}. Wait for job {existing.Id} " +
                              $"(get_job_status), then ask for {wanted}."));
                }
            }

            return Result.Success(new BlenderOperationRequested(
                existing.Id, operation, model.Id, version.Id, AlreadyQueued: true));
        }

        ExtractionJob job;
        try
        {
            job = ExtractionJob.CreateOperation(
                "Model",
                model.Id,
                ExtractorFamilies.Blender,
                operation,
                _dateTimeProvider.UtcNow,
                parametersJson: parameters.Value,
                versionId: version.Id,
                maxAttempts: BlenderOperationSpecs.MaxAttempts,
                lockTimeoutMinutes: BlenderOperationSpecs.LeaseMinutes(operation));
        }
        catch (ArgumentException ex)
        {
            return Result.Failure<BlenderOperationRequested>(new Error("Blender.InvalidJob", ex.Message));
        }

        await _jobRepository.AddAsync(job, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return Result.Success(new BlenderOperationRequested(
            job.Id, operation, model.Id, version.Id, AlreadyQueued: false));
    }

    /// <summary>
    /// Picks the version to operate on: the one asked for, or the model's active one.
    /// </summary>
    /// <remarks>
    /// Not "the newest". An operation writes a new version, so defaulting to the newest
    /// would make a second unwrap read the output of the first - each run compounding on
    /// the last rather than being another attempt at the same source. The active version is
    /// the one the app shows and the one a search hit refers to.
    /// </remarks>
    private async Task<Result<ModelVersion>> ResolveVersionAsync(
        Model model, int? versionId, CancellationToken cancellationToken)
    {
        if (versionId is { } requested)
        {
            var version = await _modelVersionRepository.GetByIdAsync(requested, cancellationToken);
            if (version is null || version.ModelId != model.Id)
            {
                return Result.Failure<ModelVersion>(new Error(
                    "Blender.VersionNotFound", $"Model {model.Id} has no version {requested}."));
            }
            return Result.Success(version);
        }

        var versions = await _modelVersionRepository.GetByModelIdAsync(model.Id, cancellationToken);
        var active = versions.FirstOrDefault(v => v.Id == model.ActiveVersionId)
            ?? versions.OrderByDescending(v => v.VersionNumber).FirstOrDefault();

        return active is null
            ? Result.Failure<ModelVersion>(new Error(
                "Blender.VersionNotFound", $"Model {model.Id} has no version to operate on."))
            : Result.Success(active);
    }
}

/// <param name="ParametersJson">Operation-specific inputs as a JSON object; null takes every default.</param>
public record RequestBlenderOperationCommand(
    int ModelId,
    string Operation,
    int? VersionId = null,
    string? ParametersJson = null) : ICommand<BlenderOperationRequested>;

/// <param name="AlreadyQueued">
/// True when this exact operation was already waiting on this version. The caller gets that
/// job's id, so asking twice costs one run.
/// </param>
public record BlenderOperationRequested(
    int JobId,
    string Operation,
    int ModelId,
    int VersionId,
    bool AlreadyQueued);
