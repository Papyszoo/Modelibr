using Application.Abstractions;
using Application.Abstractions.Messaging;
using Stage = Domain.Models.Stage;
using Application.Abstractions.Repositories;
using Domain.Models;
using SharedKernel;

namespace Application.Stages;

internal sealed class CreateStageCommandHandler : ICommandHandler<CreateStageCommand, CreateStageResponse>
{
    private readonly IStageRepository _stageRepository;
    private readonly IUnitOfWork _unitOfWork;

    public CreateStageCommandHandler(IStageRepository stageRepository, IUnitOfWork unitOfWork)
    {
        _stageRepository = stageRepository;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result<CreateStageResponse>> Handle(CreateStageCommand request, CancellationToken cancellationToken)
    {
        var stageResult = Stage.Create(request.Name, request.ConfigurationJson);

        if (stageResult.IsFailure)
        {
            return Result.Failure<CreateStageResponse>(stageResult.Error);
        }

        await _stageRepository.AddAsync(stageResult.Value, cancellationToken);
        // Commit immediately: stageResult.Value.Id is database-assigned and is
        // needed below for the response.
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return Result.Success(new CreateStageResponse(stageResult.Value.Id, stageResult.Value.Name));
    }
}
