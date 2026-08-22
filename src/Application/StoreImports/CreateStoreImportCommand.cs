using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Domain.Models;
using Domain.Services;
using SharedKernel;

namespace Application.StoreImports;

/// <summary>
/// Starts a background import of a store asset pack. Validates the (untrusted) store URL,
/// persists a <see cref="StoreImportJob"/> WITHOUT the token, then hands the token to the
/// in-memory queue only. Returns the job id immediately; progress surfaces over SignalR.
///
/// <paramref name="ImportToken"/> is optional. Blank means "send no credential", which the
/// store answers only for an approved free asset - that is how a Modelibr with no store
/// account imports CC0 content. This handler deliberately does not try to decide locally
/// whether the asset qualifies: the store owns that rule, and guessing at it here would be a
/// second copy of an entitlement check that can only ever drift.
/// </summary>
public record CreateStoreImportCommand(
    string StoreUrl, string AssetId, string? ImportToken, IReadOnlyList<string>? SelectedItemIds = null)
    : ICommand<CreateStoreImportResponse>;

public record CreateStoreImportResponse(int JobId);

internal sealed class CreateStoreImportCommandHandler : ICommandHandler<CreateStoreImportCommand, CreateStoreImportResponse>
{
    private readonly IStoreImportJobRepository _jobRepository;
    private readonly IStoreImportQueue _queue;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IUnitOfWork _unitOfWork;

    public CreateStoreImportCommandHandler(
        IStoreImportJobRepository jobRepository,
        IStoreImportQueue queue,
        IDateTimeProvider dateTimeProvider,
        IUnitOfWork unitOfWork)
    {
        _jobRepository = jobRepository;
        _queue = queue;
        _dateTimeProvider = dateTimeProvider;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result<CreateStoreImportResponse>> Handle(CreateStoreImportCommand command, CancellationToken cancellationToken)
    {
        var urlValidation = StoreUrlSafety.ValidateStoreBaseUrl(command.StoreUrl);
        if (urlValidation.IsFailure)
            return Result.Failure<CreateStoreImportResponse>(urlValidation.Error);

        if (string.IsNullOrWhiteSpace(command.AssetId))
            return Result.Failure<CreateStoreImportResponse>(new Error("StoreImport.MissingAssetId", "Asset id is required."));

        var storeUrl = command.StoreUrl.Trim().TrimEnd('/');
        var assetId = command.AssetId.Trim();

        StoreImportJob job;
        try
        {
            job = StoreImportJob.Create(storeUrl, assetId, _dateTimeProvider.UtcNow);
        }
        catch (ArgumentException ex)
        {
            return Result.Failure<CreateStoreImportResponse>(new Error("StoreImport.InvalidRequest", ex.Message));
        }

        await _jobRepository.AddAsync(job, cancellationToken);
        // Commit now so the row is durable before the background processor loads it by id.
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        // Normalize the selection: trim, drop blanks, dedupe. An empty selection means "whole pack".
        var selectedItemIds = command.SelectedItemIds?
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Select(id => id.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
        if (selectedItemIds is { Length: 0 })
            selectedItemIds = null;

        // The token lives ONLY in this in-memory work item - never persisted, never logged.
        var importToken = string.IsNullOrWhiteSpace(command.ImportToken) ? null : command.ImportToken.Trim();
        var enqueued = _queue.Enqueue(new StoreImportWorkItem(job.Id, storeUrl, assetId, importToken, selectedItemIds));
        if (!enqueued)
        {
            job.Fail("Import queue is saturated; try again shortly.", _dateTimeProvider.UtcNow);
            await _jobRepository.UpdateAsync(job, cancellationToken);
            await _unitOfWork.SaveChangesAsync(cancellationToken);
            return Result.Failure<CreateStoreImportResponse>(
                new Error("StoreImport.QueueFull", "The import queue is currently full. Please try again shortly."));
        }

        return Result.Success(new CreateStoreImportResponse(job.Id));
    }
}
