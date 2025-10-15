using Application.Abstractions.Messaging;

namespace Application.Stages;

public sealed record GenerateStageTsxCommand(int StageId) : ICommand<GenerateStageTsxResponse>;

public sealed record GenerateStageTsxResponse(string FilePath, string TsxCode);
