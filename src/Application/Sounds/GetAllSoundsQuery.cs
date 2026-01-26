using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.Sounds;

internal class GetAllSoundsQueryHandler : IQueryHandler<GetAllSoundsQuery, GetAllSoundsResponse>
{
    private readonly ISoundRepository _soundRepository;

    public GetAllSoundsQueryHandler(ISoundRepository soundRepository)
    {
        _soundRepository = soundRepository;
    }

    public async Task<Result<GetAllSoundsResponse>> Handle(GetAllSoundsQuery query, CancellationToken cancellationToken)
    {
        var sounds = await _soundRepository.GetAllAsync(cancellationToken);

        var filteredSounds = sounds.Where(s => !s.IsDeleted);

        // Filter by packId if provided
        if (query.PackId.HasValue)
        {
            filteredSounds = filteredSounds.Where(s => s.Packs.Any(p => p.Id == query.PackId.Value));
        }

        // Filter by projectId if provided
        if (query.ProjectId.HasValue)
        {
            filteredSounds = filteredSounds.Where(s => s.Projects.Any(p => p.Id == query.ProjectId.Value));
        }

        // Filter by categoryId if provided
        if (query.CategoryId.HasValue)
        {
            filteredSounds = filteredSounds.Where(s => s.SoundCategoryId == query.CategoryId.Value);
        }

        var soundDtos = filteredSounds
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
                s.UpdatedAt))
            .ToList();

        return Result.Success(new GetAllSoundsResponse(soundDtos));
    }
}

public record GetAllSoundsQuery(int? PackId = null, int? ProjectId = null, int? CategoryId = null) : IQuery<GetAllSoundsResponse>;

public record GetAllSoundsResponse(IReadOnlyList<SoundDto> Sounds);

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
    DateTime UpdatedAt);
