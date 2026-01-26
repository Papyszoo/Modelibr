using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.Sounds;

internal class GetSoundByIdQueryHandler : IQueryHandler<GetSoundByIdQuery, GetSoundByIdResponse>
{
    private readonly ISoundRepository _soundRepository;

    public GetSoundByIdQueryHandler(ISoundRepository soundRepository)
    {
        _soundRepository = soundRepository;
    }

    public async Task<Result<GetSoundByIdResponse>> Handle(GetSoundByIdQuery query, CancellationToken cancellationToken)
    {
        var sound = await _soundRepository.GetByIdAsync(query.Id, cancellationToken);

        if (sound == null)
        {
            return Result.Failure<GetSoundByIdResponse>(
                new Error("SoundNotFound", $"Sound with ID {query.Id} not found."));
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
            sound.UpdatedAt);

        return Result.Success(new GetSoundByIdResponse(soundDto));
    }
}

public record GetSoundByIdQuery(int Id) : IQuery<GetSoundByIdResponse>;
public record GetSoundByIdResponse(SoundDto Sound);
