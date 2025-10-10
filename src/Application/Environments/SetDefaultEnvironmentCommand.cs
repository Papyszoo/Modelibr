using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.Environments;

internal class SetDefaultEnvironmentCommandHandler : ICommandHandler<SetDefaultEnvironmentCommand, SetDefaultEnvironmentResponse>
{
    private readonly IEnvironmentRepository _environmentRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public SetDefaultEnvironmentCommandHandler(
        IEnvironmentRepository environmentRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _environmentRepository = environmentRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result<SetDefaultEnvironmentResponse>> Handle(SetDefaultEnvironmentCommand command, CancellationToken cancellationToken)
    {
        var environment = await _environmentRepository.GetByIdAsync(command.Id, cancellationToken);
        if (environment == null)
        {
            return Result.Failure<SetDefaultEnvironmentResponse>(
                new Error("EnvironmentNotFound", $"Environment with ID {command.Id} was not found."));
        }

        // Unset current default
        var currentDefault = await _environmentRepository.GetDefaultAsync(cancellationToken);
        if (currentDefault != null && currentDefault.Id != command.Id)
        {
            currentDefault.UnsetAsDefault(_dateTimeProvider.UtcNow);
            await _environmentRepository.UpdateAsync(currentDefault, cancellationToken);
        }

        // Set new default
        environment.SetAsDefault(_dateTimeProvider.UtcNow);
        await _environmentRepository.UpdateAsync(environment, cancellationToken);

        return Result.Success(new SetDefaultEnvironmentResponse(command.Id));
    }
}

public record SetDefaultEnvironmentCommand(int Id) : ICommand<SetDefaultEnvironmentResponse>;

public record SetDefaultEnvironmentResponse(int Id);
