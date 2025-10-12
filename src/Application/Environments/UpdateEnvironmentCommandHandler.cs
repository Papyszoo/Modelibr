using Application.Abstractions.Messaging;
using EnvironmentEntity = Domain.Models.Environment;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.Environments;

internal sealed class UpdateEnvironmentCommandHandler : ICommandHandler<UpdateEnvironmentCommand, UpdateEnvironmentResponse>
{
    private readonly IEnvironmentRepository _environmentRepository;

    public UpdateEnvironmentCommandHandler(IEnvironmentRepository environmentRepository)
    {
        _environmentRepository = environmentRepository;
    }

    public async Task<Result<UpdateEnvironmentResponse>> Handle(UpdateEnvironmentCommand request, CancellationToken cancellationToken)
    {
        var environment = await _environmentRepository.GetByIdAsync(request.Id, cancellationToken);
        
        if (environment == null)
        {
            return Result.Failure<UpdateEnvironmentResponse>(new Error("EnvironmentEntity.NotFound", $"EnvironmentEntity with ID {request.Id} not found"));
        }

        var updateResult = environment.UpdateConfiguration(request.ConfigurationJson);
        
        if (!updateResult.IsSuccess)
        {
            return Result.Failure<UpdateEnvironmentResponse>(updateResult.Error);
        }

        await _environmentRepository.UpdateAsync(environment, cancellationToken);

        return Result.Success(new UpdateEnvironmentResponse(environment.Id, environment.Name));
    }
}
