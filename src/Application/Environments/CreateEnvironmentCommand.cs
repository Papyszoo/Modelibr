using Application.Abstractions.Messaging;
using EnvironmentEntity = Domain.Models.Environment;

namespace Application.Environments;

public sealed record CreateEnvironmentCommand(string Name, string ConfigurationJson) : ICommand<CreateEnvironmentResponse>;

public sealed record CreateEnvironmentResponse(int Id, string Name);
