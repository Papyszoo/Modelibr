using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Models;
using Domain.ValueObjects;
using SharedKernel;

namespace Application.Sounds;

internal class GetSoundByIdQueryHandler : IQueryHandler<GetSoundByIdQuery, GetSoundByIdResponse>
{
    private readonly ISoundRepository _soundRepository;
    private readonly IThumbnailJobRepository _thumbnailJobRepository;

    public GetSoundByIdQueryHandler(
        ISoundRepository soundRepository,
        IThumbnailJobRepository thumbnailJobRepository)
    {
        _soundRepository = soundRepository;
        _thumbnailJobRepository = thumbnailJobRepository;
    }

    public async Task<Result<GetSoundByIdResponse>> Handle(GetSoundByIdQuery query, CancellationToken cancellationToken)
    {
        var sound = await _soundRepository.GetByIdAsync(query.Id, cancellationToken);

        if (sound == null)
        {
            return Result.Failure<GetSoundByIdResponse>(
                new Error("SoundNotFound", $"Sound with ID {query.Id} not found."));
        }

        // Check if waveform job is completed in database
        string? waveformUrl = null;
        var jobs = await _thumbnailJobRepository.GetBySoundIdsAsync(new[] { sound.Id }, cancellationToken);
        var hasCompletedJob = jobs.Any(j => j.Status == ThumbnailJobStatus.Done);
        
        if (hasCompletedJob)
        {
            waveformUrl = $"/sounds/{sound.Id}/waveform";
        }

        var soundDto = new SoundDto(
            sound.Id,
            sound.Name,
            sound.FileId,
            sound.SoundCategoryId,
            sound.Category?.Name,
            sound.Duration,
            sound.Peaks,
            sound.File?.OriginalFileName ?? "",
            sound.File?.SizeBytes ?? 0,
            sound.CreatedAt,
            sound.UpdatedAt,
            waveformUrl);

        return Result.Success(new GetSoundByIdResponse(soundDto));
    }
}

public record GetSoundByIdQuery(int Id) : IQuery<GetSoundByIdResponse>;
public record GetSoundByIdResponse(SoundDto Sound);
