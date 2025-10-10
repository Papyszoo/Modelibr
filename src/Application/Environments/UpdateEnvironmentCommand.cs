using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.Environments;

internal class UpdateEnvironmentCommandHandler : ICommandHandler<UpdateEnvironmentCommand, UpdateEnvironmentResponse>
{
    private readonly IEnvironmentRepository _environmentRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public UpdateEnvironmentCommandHandler(
        IEnvironmentRepository environmentRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _environmentRepository = environmentRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result<UpdateEnvironmentResponse>> Handle(UpdateEnvironmentCommand command, CancellationToken cancellationToken)
    {
        try
        {
            var environment = await _environmentRepository.GetByIdAsync(command.Id, cancellationToken);
            if (environment == null)
            {
                return Result.Failure<UpdateEnvironmentResponse>(
                    new Error("EnvironmentNotFound", $"Environment with ID {command.Id} was not found."));
            }

            // Check if name is being changed to one that already exists
            if (environment.Name != command.Name)
            {
                var existingWithName = await _environmentRepository.GetByNameAsync(command.Name, cancellationToken);
                if (existingWithName != null)
                {
                    return Result.Failure<UpdateEnvironmentResponse>(
                        new Error("EnvironmentNameExists", $"An environment with the name '{command.Name}' already exists."));
                }
                environment.UpdateName(command.Name, _dateTimeProvider.UtcNow);
            }

            if (environment.Description != command.Description)
            {
                environment.UpdateDescription(command.Description, _dateTimeProvider.UtcNow);
            }

            environment.UpdateLightingSettings(
                command.LightIntensity,
                command.EnvironmentPreset,
                _dateTimeProvider.UtcNow);

            environment.UpdateShadowSettings(
                command.ShowShadows,
                command.ShadowType,
                command.ShadowOpacity,
                command.ShadowBlur,
                _dateTimeProvider.UtcNow);

            await _environmentRepository.UpdateAsync(environment, cancellationToken);

            return Result.Success(new UpdateEnvironmentResponse(environment.Id));
        }
        catch (ArgumentException ex)
        {
            return Result.Failure<UpdateEnvironmentResponse>(
                new Error("EnvironmentUpdateFailed", ex.Message));
        }
    }
}

public record UpdateEnvironmentCommand(
    int Id,
    string Name,
    string? Description,
    double LightIntensity,
    string EnvironmentPreset,
    bool ShowShadows,
    string? ShadowType,
    double ShadowOpacity,
    double ShadowBlur) : ICommand<UpdateEnvironmentResponse>;

public record UpdateEnvironmentResponse(int Id);
