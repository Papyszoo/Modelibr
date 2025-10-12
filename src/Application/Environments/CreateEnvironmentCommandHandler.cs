using Application.Abstractions.Messaging;
using EnvironmentEntity = Domain.Models.Environment;
using Application.Abstractions.Repositories;
using Domain.Models;
using SharedKernel;

namespace Application.Environments;

internal sealed class CreateEnvironmentCommandHandler : ICommandHandler<CreateEnvironmentCommand, CreateEnvironmentResponse>
{
    private readonly IEnvironmentRepository _environmentRepository;

    public CreateEnvironmentCommandHandler(IEnvironmentRepository environmentRepository)
    {
        _environmentRepository = environmentRepository;
    }

    public async Task<Result<CreateEnvironmentResponse>> Handle(CreateEnvironmentCommand request, CancellationToken cancellationToken)
    {
        var environmentResult = EnvironmentEntity.Create(request.Name, request.ConfigurationJson);
        
        if (!environmentResult.IsSuccess)
        {
            return Result.Failure<CreateEnvironmentResponse>(environmentResult.Error);
        }

        await _environmentRepository.AddAsync(environmentResult.Value, cancellationToken);

        return Result.Success(new CreateEnvironmentResponse(environmentResult.Value.Id, environmentResult.Value.Name));
    }
}
