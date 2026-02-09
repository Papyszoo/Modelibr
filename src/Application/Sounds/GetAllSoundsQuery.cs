using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Models;
using Domain.ValueObjects;
using SharedKernel;

namespace Application.Sounds;

internal class GetAllSoundsQueryHandler : IQueryHandler<GetAllSoundsQuery, GetAllSoundsResponse>
{
    private readonly ISoundRepository _soundRepository;
    private readonly IThumbnailJobRepository _thumbnailJobRepository;

    public GetAllSoundsQueryHandler(
        ISoundRepository soundRepository,
        IThumbnailJobRepository thumbnailJobRepository)
    {
        _soundRepository = soundRepository;
        _thumbnailJobRepository = thumbnailJobRepository;
    }

    public async Task<Result<GetAllSoundsResponse>> Handle(GetAllSoundsQuery query, CancellationToken cancellationToken)
    {
        IEnumerable<Sound> soundsList;
        int? totalCount = null;

        if (query.Page.HasValue && query.PageSize.HasValue)
        {
            var result = await _soundRepository.GetPagedAsync(
                query.Page.Value, query.PageSize.Value,
                query.PackId, query.ProjectId, query.CategoryId,
                cancellationToken);
            soundsList = result.Items;
            totalCount = result.TotalCount;
        }
        else
        {
            var sounds = await _soundRepository.GetAllAsync(cancellationToken);
            var filteredSounds = sounds.Where(s => !s.IsDeleted);

            if (query.PackId.HasValue)
                filteredSounds = filteredSounds.Where(s => s.Packs.Any(p => p.Id == query.PackId.Value));
            if (query.ProjectId.HasValue)
                filteredSounds = filteredSounds.Where(s => s.Projects.Any(p => p.Id == query.ProjectId.Value));
            if (query.CategoryId.HasValue)
                filteredSounds = filteredSounds.Where(s => s.SoundCategoryId == query.CategoryId.Value);

            soundsList = filteredSounds.ToList();
        }

        // Get completed waveform jobs for all sounds in one query
        var soundIds = soundsList.Select(s => s.Id).ToList();
        var completedJobs = await _thumbnailJobRepository.GetBySoundIdsAsync(soundIds, cancellationToken);
        var completedSoundIds = completedJobs
            .Where(j => j.Status == ThumbnailJobStatus.Done)
            .Select(j => j.SoundId)
            .Where(id => id.HasValue)
            .Select(id => id!.Value)
            .ToHashSet();

        var soundDtos = soundsList
            .Select(s => new SoundDto(
                s.Id,
                s.Name,
                s.FileId,
                s.SoundCategoryId,
                s.Category?.Name,
                s.Duration,
                s.Peaks,
                s.File?.OriginalFileName ?? "",
                s.File?.SizeBytes ?? 0,
                s.CreatedAt,
                s.UpdatedAt,
                completedSoundIds.Contains(s.Id) ? $"/sounds/{s.Id}/waveform" : null))
            .ToList();

        int? totalPages = (totalCount.HasValue && query.PageSize.HasValue)
            ? (int)Math.Ceiling((double)totalCount.Value / query.PageSize.Value)
            : null;

        return Result.Success(new GetAllSoundsResponse(soundDtos, totalCount, query.Page, query.PageSize, totalPages));
    }
}

public record GetAllSoundsQuery(int? PackId = null, int? ProjectId = null, int? CategoryId = null, int? Page = null, int? PageSize = null) : IQuery<GetAllSoundsResponse>;

public record GetAllSoundsResponse(IReadOnlyList<SoundDto> Sounds, int? TotalCount = null, int? Page = null, int? PageSize = null, int? TotalPages = null);

public record SoundDto(
    int Id,
    string Name,
    int FileId,
    int? CategoryId,
    string? CategoryName,
    double Duration,
    string? Peaks,
    string FileName,
    long FileSizeBytes,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    string? WaveformUrl);
