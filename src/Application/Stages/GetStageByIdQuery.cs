using Application.Abstractions.Messaging;
using Stage = Domain.Models.Stage;

namespace Application.Stages;

public sealed record GetStageByIdQuery(int Id) : IQuery<GetStageByIdResponse>;

public sealed record GetStageByIdResponse(int Id, string Name, string ConfigurationJson, DateTime CreatedAt, DateTime UpdatedAt);
