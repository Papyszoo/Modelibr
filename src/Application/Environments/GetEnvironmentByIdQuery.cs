using Application.Abstractions.Messaging;
using EnvironmentEntity = Domain.Models.Environment;

namespace Application.Environments;

public sealed record GetEnvironmentByIdQuery(int Id) : IQuery<GetEnvironmentByIdResponse>;

public sealed record GetEnvironmentByIdResponse(int Id, string Name, string ConfigurationJson, DateTime CreatedAt, DateTime UpdatedAt);
