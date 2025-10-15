using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using SharedKernel;

namespace Application.Stages;

internal sealed class GenerateStageTsxCommandHandler : ICommandHandler<GenerateStageTsxCommand, GenerateStageTsxResponse>
{
    private readonly IStageRepository _stageRepository;
    private readonly ITsxGenerationService _tsxGenerationService;
    private readonly IStageFileStorage _stageFileStorage;

    public GenerateStageTsxCommandHandler(
        IStageRepository stageRepository,
        ITsxGenerationService tsxGenerationService,
        IStageFileStorage stageFileStorage)
    {
        _stageRepository = stageRepository;
        _tsxGenerationService = tsxGenerationService;
        _stageFileStorage = stageFileStorage;
    }

    public async Task<Result<GenerateStageTsxResponse>> Handle(GenerateStageTsxCommand request, CancellationToken cancellationToken)
    {
        var stage = await _stageRepository.GetByIdAsync(request.StageId, cancellationToken);
        if (stage == null)
        {
            return Result.Failure<GenerateStageTsxResponse>(
                new Error("Stage.NotFound", $"Stage with ID {request.StageId} not found"));
        }

        // Generate TSX code
        var tsxCode = _tsxGenerationService.GenerateTsxCode(stage.Name, stage.ConfigurationJson);

        // Save TSX file
        var filePath = await _stageFileStorage.SaveTsxFileAsync(stage.Name, tsxCode, cancellationToken);

        // Update stage with file path
        stage.SetTsxFilePath(filePath);
        await _stageRepository.UpdateAsync(stage, cancellationToken);

        return Result.Success(new GenerateStageTsxResponse(filePath, tsxCode));
    }
}
