using Application.Abstractions.Messaging;
using Stage = Domain.Models.Stage;

namespace Application.Stages;

public sealed record GetStageByIdQuery(int Id) : IQuery<GetStageByIdResponse>;

public sealed record GetStageByIdResponse(int Id, string Name, string ConfigurationJson, string? TsxFilePath, DateTime CreatedAt, DateTime UpdatedAt);
