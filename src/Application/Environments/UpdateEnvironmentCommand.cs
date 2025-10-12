using Application.Abstractions.Messaging;
using EnvironmentEntity = Domain.Models.Environment;

namespace Application.Environments;

public sealed record UpdateEnvironmentCommand(int Id, string ConfigurationJson) : ICommand<UpdateEnvironmentResponse>;

public sealed record UpdateEnvironmentResponse(int Id, string Name);
