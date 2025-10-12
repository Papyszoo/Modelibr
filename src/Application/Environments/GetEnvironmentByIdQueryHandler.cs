using Application.Abstractions.Messaging;
using EnvironmentEntity = Domain.Models.Environment;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.Environments;

internal sealed class GetEnvironmentByIdQueryHandler : IQueryHandler<GetEnvironmentByIdQuery, GetEnvironmentByIdResponse>
{
    private readonly IEnvironmentRepository _environmentRepository;

    public GetEnvironmentByIdQueryHandler(IEnvironmentRepository environmentRepository)
    {
        _environmentRepository = environmentRepository;
    }

    public async Task<Result<GetEnvironmentByIdResponse>> Handle(GetEnvironmentByIdQuery request, CancellationToken cancellationToken)
    {
        var environment = await _environmentRepository.GetByIdAsync(request.Id, cancellationToken);
        
        if (environment == null)
        {
            return Result.Failure<GetEnvironmentByIdResponse>(new Error("EnvironmentEntity.NotFound", $"EnvironmentEntity with ID {request.Id} not found"));
        }
        
        return Result.Success(new GetEnvironmentByIdResponse(
            environment.Id, 
            environment.Name, 
            environment.ConfigurationJson, 
            environment.CreatedAt, 
            environment.UpdatedAt
        ));
    }
}
