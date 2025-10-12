using Application.Abstractions.Messaging;
using EnvironmentEntity = Domain.Models.Environment;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.Environments;

internal sealed class GetAllEnvironmentsQueryHandler : IQueryHandler<GetAllEnvironmentsQuery, GetAllEnvironmentsResponse>
{
    private readonly IEnvironmentRepository _environmentRepository;

    public GetAllEnvironmentsQueryHandler(IEnvironmentRepository environmentRepository)
    {
        _environmentRepository = environmentRepository;
    }

    public async Task<Result<GetAllEnvironmentsResponse>> Handle(GetAllEnvironmentsQuery request, CancellationToken cancellationToken)
    {
        var environments = await _environmentRepository.GetAllAsync(cancellationToken);
        
        var environmentDtos = environments.Select(s => new EnvironmentDto(s.Id, s.Name, s.CreatedAt, s.UpdatedAt));
        
        return Result.Success(new GetAllEnvironmentsResponse(environmentDtos));
    }
}
