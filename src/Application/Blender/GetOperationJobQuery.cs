using System.Text.Json;
using System.Text.Json.Nodes;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.ValueObjects;
using SharedKernel;

namespace Application.Blender;

/// <summary>
/// Reads one queued job's state. The other half of every asynchronous tool: an operation
/// that hands back a job id is only usable if that id can be turned back into an answer.
/// </summary>
internal sealed class GetOperationJobQueryHandler
    : IQueryHandler<GetOperationJobQuery, OperationJobView>
{
    private readonly IExtractionJobRepository _repository;

    public GetOperationJobQueryHandler(IExtractionJobRepository repository)
    {
        _repository = repository;
    }

    public async Task<Result<OperationJobView>> Handle(
        GetOperationJobQuery query, CancellationToken cancellationToken)
    {
        var job = await _repository.GetByIdAsync(query.JobId, cancellationToken);
        if (job is null)
        {
            return Result.Failure<OperationJobView>(new Error(
                "Job.NotFound", $"Job {query.JobId} was not found."));
        }

        return Result.Success(new OperationJobView(
            job.Id,
            job.Operation,
            job.ExtractorFamily,
            job.AssetType,
            job.AssetId,
            job.VersionId,
            job.Status.ToString(),
            job.AttemptCount,
            job.MaxAttempts,
            job.ErrorMessage,
            job.WarningDetail,
            ParseResult(job.ResultJson),
            job.CreatedAt,
            job.CompletedAt,
            Describe(job.Status, job.Operation, job.ErrorMessage)));
    }

    /// <summary>
    /// Hands the result back as JSON rather than as a string of JSON, so a caller reads
    /// <c>result.versionId</c> instead of parsing a quoted blob. Unparseable content is
    /// dropped rather than thrown: a malformed result should not make a finished job
    /// unreadable, and the status still says it finished.
    /// </summary>
    private static JsonNode? ParseResult(string? resultJson)
    {
        if (string.IsNullOrWhiteSpace(resultJson)) return null;
        try { return JsonNode.Parse(resultJson); }
        catch (JsonException) { return null; }
    }

    /// <summary>
    /// One sentence saying what the status means for the caller, because "Dead" and
    /// "Pending" are queue words, not answers to "did my unwrap happen?".
    /// </summary>
    private static string Describe(ExtractionJobStatus status, string? operation, string? error)
    {
        var what = operation ?? "job";
        return status switch
        {
            ExtractionJobStatus.Pending => $"The {what} is queued and has not started yet.",
            ExtractionJobStatus.Processing => $"The {what} is running now.",
            ExtractionJobStatus.Done => $"The {what} finished.",
            ExtractionJobStatus.Dead =>
                $"The {what} failed and will not be retried: {error ?? "no reason recorded"}.",
            _ => $"The {what} is {status}."
        };
    }
}

public record GetOperationJobQuery(int JobId) : IQuery<OperationJobView>;

/// <param name="Operation">Null when the job is a plain re-derive rather than an operation.</param>
/// <param name="Result">What the operation produced, or null while it has not produced it yet.</param>
public record OperationJobView(
    int JobId,
    string? Operation,
    string Family,
    string AssetType,
    int AssetId,
    int? VersionId,
    string Status,
    int AttemptCount,
    int MaxAttempts,
    string? ErrorMessage,
    string? WarningDetail,
    JsonNode? Result,
    DateTime CreatedAt,
    DateTime? CompletedAt,
    string Summary);
