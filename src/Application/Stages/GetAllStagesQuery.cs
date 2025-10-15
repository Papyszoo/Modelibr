using Application.Abstractions.Messaging;
using Stage = Domain.Models.Stage;

namespace Application.Stages;

public sealed record GetAllStagesQuery : IQuery<GetAllStagesResponse>;

public sealed record GetAllStagesResponse(IEnumerable<StageDto> Stages);

public sealed record StageDto(int Id, string Name, string? TsxFilePath, DateTime CreatedAt, DateTime UpdatedAt);
