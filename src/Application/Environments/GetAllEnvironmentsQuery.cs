using Application.Abstractions.Messaging;
using EnvironmentEntity = Domain.Models.Environment;

namespace Application.Environments;

public sealed record GetAllEnvironmentsQuery : IQuery<GetAllEnvironmentsResponse>;

public sealed record GetAllEnvironmentsResponse(IEnumerable<EnvironmentDto> Environments);

public sealed record EnvironmentDto(int Id, string Name, DateTime CreatedAt, DateTime UpdatedAt);
