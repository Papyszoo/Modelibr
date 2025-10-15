using Application.Abstractions.Messaging;

namespace Application.Stages;

public sealed record GetStageTsxQuery(int StageId) : IQuery<GetStageTsxResponse>;

public sealed record GetStageTsxResponse(string TsxCode, string FileName);
