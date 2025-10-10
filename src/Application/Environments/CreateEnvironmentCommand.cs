using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.Environments;

internal class CreateEnvironmentCommandHandler : ICommandHandler<CreateEnvironmentCommand, CreateEnvironmentResponse>
{
    private readonly IEnvironmentRepository _environmentRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public CreateEnvironmentCommandHandler(
        IEnvironmentRepository environmentRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _environmentRepository = environmentRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result<CreateEnvironmentResponse>> Handle(CreateEnvironmentCommand command, CancellationToken cancellationToken)
    {
        try
        {
            // Check if an environment with the same name already exists
            var existingEnvironment = await _environmentRepository.GetByNameAsync(command.Name, cancellationToken);
            if (existingEnvironment != null)
            {
                return Result.Failure<CreateEnvironmentResponse>(
                    new Error("EnvironmentAlreadyExists", $"An environment with the name '{command.Name}' already exists."));
            }

            // If this is marked as default, unset any existing defaults
            if (command.IsDefault)
            {
                var currentDefault = await _environmentRepository.GetDefaultAsync(cancellationToken);
                if (currentDefault != null)
                {
                    currentDefault.UnsetAsDefault(_dateTimeProvider.UtcNow);
                    await _environmentRepository.UpdateAsync(currentDefault, cancellationToken);
                }
            }

            // Create new environment using domain factory method
            var environment = Domain.Models.Environment.Create(
                command.Name,
                command.LightIntensity,
                command.EnvironmentPreset,
                command.ShowShadows,
                _dateTimeProvider.UtcNow,
                command.IsDefault,
                command.Description);

            var savedEnvironment = await _environmentRepository.AddAsync(environment, cancellationToken);

            return Result.Success(new CreateEnvironmentResponse(
                savedEnvironment.Id,
                savedEnvironment.Name,
                savedEnvironment.Description,
                savedEnvironment.IsDefault));
        }
        catch (ArgumentException ex)
        {
            return Result.Failure<CreateEnvironmentResponse>(
                new Error("EnvironmentCreationFailed", ex.Message));
        }
    }
}

public record CreateEnvironmentCommand(
    string Name,
    double LightIntensity,
    string EnvironmentPreset,
    bool ShowShadows,
    bool IsDefault = false,
    string? Description = null) : ICommand<CreateEnvironmentResponse>;

public record CreateEnvironmentResponse(
    int Id,
    string Name,
    string? Description,
    bool IsDefault);
