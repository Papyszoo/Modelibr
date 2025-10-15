using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using SharedKernel;

namespace Application.Stages;

internal sealed class GetStageTsxQueryHandler : IQueryHandler<GetStageTsxQuery, GetStageTsxResponse>
{
    private readonly IStageRepository _stageRepository;
    private readonly IStageFileStorage _stageFileStorage;
    private readonly ITsxGenerationService _tsxGenerationService;

    public GetStageTsxQueryHandler(
        IStageRepository stageRepository,
        IStageFileStorage stageFileStorage,
        ITsxGenerationService tsxGenerationService)
    {
        _stageRepository = stageRepository;
        _stageFileStorage = stageFileStorage;
        _tsxGenerationService = tsxGenerationService;
    }

    public async Task<Result<GetStageTsxResponse>> Handle(GetStageTsxQuery request, CancellationToken cancellationToken)
    {
        var stage = await _stageRepository.GetByIdAsync(request.StageId, cancellationToken);
        if (stage == null)
        {
            return Result.Failure<GetStageTsxResponse>(
                new Error("Stage.NotFound", $"Stage with ID {request.StageId} not found"));
        }

        string tsxCode;
        
        // Try to load from file if it exists
        if (!string.IsNullOrEmpty(stage.TsxFilePath) && _stageFileStorage.TsxFileExists(stage.TsxFilePath))
        {
            tsxCode = await _stageFileStorage.GetTsxFileAsync(stage.TsxFilePath, cancellationToken);
        }
        else
        {
            // Generate on-the-fly if file doesn't exist
            tsxCode = _tsxGenerationService.GenerateTsxCode(stage.Name, stage.ConfigurationJson);
        }

        var fileName = SanitizeFileName(stage.Name) + ".tsx";
        return Result.Success(new GetStageTsxResponse(tsxCode, fileName));
    }

    private string SanitizeFileName(string fileName)
    {
        var invalid = Path.GetInvalidFileNameChars();
        return new string(fileName.Select(c => invalid.Contains(c) ? '_' : c).ToArray());
    }
}
