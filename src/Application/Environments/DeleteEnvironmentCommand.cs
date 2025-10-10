using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.Environments;

internal class DeleteEnvironmentCommandHandler : ICommandHandler<DeleteEnvironmentCommand, DeleteEnvironmentResponse>
{
    private readonly IEnvironmentRepository _environmentRepository;

    public DeleteEnvironmentCommandHandler(IEnvironmentRepository environmentRepository)
    {
        _environmentRepository = environmentRepository;
    }

    public async Task<Result<DeleteEnvironmentResponse>> Handle(DeleteEnvironmentCommand command, CancellationToken cancellationToken)
    {
        var environment = await _environmentRepository.GetByIdAsync(command.Id, cancellationToken);
        if (environment == null)
        {
            return Result.Failure<DeleteEnvironmentResponse>(
                new Error("EnvironmentNotFound", $"Environment with ID {command.Id} was not found."));
        }

        // Prevent deletion of default environment
        if (environment.IsDefault)
        {
            return Result.Failure<DeleteEnvironmentResponse>(
                new Error("CannotDeleteDefault", "Cannot delete the default environment. Set another environment as default first."));
        }

        await _environmentRepository.DeleteAsync(command.Id, cancellationToken);

        return Result.Success(new DeleteEnvironmentResponse(command.Id));
    }
}

public record DeleteEnvironmentCommand(int Id) : ICommand<DeleteEnvironmentResponse>;

public record DeleteEnvironmentResponse(int Id);
