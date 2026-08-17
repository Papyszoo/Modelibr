using Application.Abstractions;
using Application.Abstractions.Files;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Abstractions.Storage;
using Domain.Files;
using Domain.Models;
using Domain.Services;
using SharedKernel;

namespace Application.Scenes;

/// <summary>
/// Stores the picture a worker took of a scene and records it against the job that asked.
///
/// Split from finishing the job for the same reason the thumbnail path splits them: the
/// bytes go up as multipart and the job's lifecycle transition is a separate small JSON
/// call, so a large upload never holds a queue transition open.
/// </summary>
internal class UploadSceneRenderCommandHandler : ICommandHandler<UploadSceneRenderCommand, UploadSceneRenderCommandResponse>
{
    private readonly IThumbnailJobRepository _jobRepository;
    private readonly ISceneRenderRepository _renderRepository;
    private readonly IFileStorage _fileStorage;
    private readonly IUploadPathProvider _pathProvider;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IUnitOfWork _unitOfWork;

    public UploadSceneRenderCommandHandler(
        IThumbnailJobRepository jobRepository,
        ISceneRenderRepository renderRepository,
        IFileStorage fileStorage,
        IUploadPathProvider pathProvider,
        IDateTimeProvider dateTimeProvider,
        IUnitOfWork unitOfWork)
    {
        _jobRepository = jobRepository;
        _renderRepository = renderRepository;
        _fileStorage = fileStorage;
        _pathProvider = pathProvider;
        _dateTimeProvider = dateTimeProvider;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result<UploadSceneRenderCommandResponse>> Handle(UploadSceneRenderCommand command, CancellationToken cancellationToken)
    {
        var job = await _jobRepository.GetByIdAsync(command.JobId, cancellationToken);
        if (job == null)
        {
            return Result.Failure<UploadSceneRenderCommandResponse>(
                new Error("SceneRenderJobNotFound", $"Thumbnail job with ID {command.JobId} was not found."));
        }

        // The job carries the scene id and the angle. Taking them from the job rather than
        // from the request is what makes a retry produce a comparable picture: a worker
        // that reported a different scene or viewpoint than the one it was handed would
        // store an answer to a question nobody asked.
        if (job.AssetType != "Scene" || job.SceneId is null)
        {
            return Result.Failure<UploadSceneRenderCommandResponse>(
                new Error("NotASceneRenderJob", $"Thumbnail job {command.JobId} is a {job.AssetType} job, not a scene render."));
        }

        var existing = await _renderRepository.GetByJobIdAsync(command.JobId, cancellationToken);
        if (existing is not null)
        {
            return Result.Failure<UploadSceneRenderCommandResponse>(
                new Error("SceneRenderAlreadyStored", $"Thumbnail job {command.JobId} already stored a render."));
        }

        try
        {
            // FileType.Texture, as the texture-set thumbnail path also does: the enum
            // classifies what the bytes are for storage layout, and there is no image
            // bucket beyond it. This is not the render being a texture.
            var storedFileResult = await _fileStorage.SaveAsync(command.RenderFile, FileType.Texture, cancellationToken);
            var fullPath = Path.Combine(_pathProvider.UploadRootPath, storedFileResult.RelativePath);

            var render = SceneRender.Create(
                job.SceneId.Value,
                job.Id,
                job.SceneViewpoint ?? "iso",
                fullPath,
                storedFileResult.SizeBytes,
                command.Width,
                command.Height,
                command.NodesLoaded,
                command.NodesFailed,
                command.TimedOut,
                _dateTimeProvider.UtcNow);

            await _renderRepository.AddAsync(render, cancellationToken);
            await _unitOfWork.SaveChangesAsync(cancellationToken);

            return Result.Success(new UploadSceneRenderCommandResponse(
                render.Id,
                job.SceneId.Value,
                fullPath,
                storedFileResult.SizeBytes));
        }
        catch (Exception ex)
        {
            return Result.Failure<UploadSceneRenderCommandResponse>(
                new Error("SceneRenderUploadFailed", $"Failed to store scene render: {ex.Message}"));
        }
    }
}

public record UploadSceneRenderCommand(
    int JobId,
    IFileUpload RenderFile,
    int Width,
    int Height,
    int NodesLoaded,
    int NodesFailed,
    bool TimedOut) : ICommand<UploadSceneRenderCommandResponse>;

public record UploadSceneRenderCommandResponse(
    int RenderId,
    int SceneId,
    string FilePath,
    long SizeBytes);
