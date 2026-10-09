using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Domain.Models;
using Domain.Services;
using Microsoft.Extensions.Logging;
using SharedKernel;
using System.Text.Json;

namespace Application.Vfx;

/// <summary>
/// Creates a visual effect from one validated definition. A missing definition becomes the
/// default - a valid two-second, empty effect - so the cheapest way to start is to name one.
/// </summary>
public record CreateVfxCommand(
    string Name,
    string? Description = null,
    JsonElement? Definition = null) : ICommand<VfxWriteOutcome>;

internal sealed class CreateVfxCommandHandler : ICommandHandler<CreateVfxCommand, VfxWriteOutcome>
{
    private readonly IVfxRepository _vfxRepository;
    private readonly IModelRepository _modelRepository;
    private readonly IModelVersionRepository _modelVersionRepository;
    private readonly ISoundRepository _soundRepository;
    private readonly ISpriteRepository _spriteRepository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IThumbnailQueue _thumbnailQueue;
    private readonly ILogger<CreateVfxCommandHandler> _logger;

    public CreateVfxCommandHandler(
        IVfxRepository vfxRepository,
        IModelRepository modelRepository,
        IModelVersionRepository modelVersionRepository,
        ISoundRepository soundRepository,
        ISpriteRepository spriteRepository,
        IDateTimeProvider dateTimeProvider,
        IUnitOfWork unitOfWork,
        IThumbnailQueue thumbnailQueue,
        ILogger<CreateVfxCommandHandler> logger)
    {
        _vfxRepository = vfxRepository;
        _modelRepository = modelRepository;
        _modelVersionRepository = modelVersionRepository;
        _soundRepository = soundRepository;
        _spriteRepository = spriteRepository;
        _dateTimeProvider = dateTimeProvider;
        _unitOfWork = unitOfWork;
        _thumbnailQueue = thumbnailQueue;
        _logger = logger;
    }

    public async Task<Result<VfxWriteOutcome>> Handle(
        CreateVfxCommand command,
        CancellationToken cancellationToken)
    {
        var read = VfxDefinition.Read(command.Definition);
        if (read.Problems.Count > 0)
            return Result.Success(VfxWriteOutcome.Invalid(read.Problems));

        var check = await VfxReferenceChecker.CheckAsync(
            read.Definition,
            _modelRepository,
            _modelVersionRepository,
            _soundRepository,
            _spriteRepository,
            cancellationToken);

        if (check.Problems.Count > 0)
        {
            // A validation failure is a first-class outcome, not an Error: the caller needs
            // every problem's path so an editor or agent can fix them all in one retry.
            return Result.Success(VfxWriteOutcome.Invalid(check.Problems));
        }

        try
        {
            var vfx = Domain.Models.Vfx.Create(
                command.Name,
                command.Description,
                VfxDefinition.Serialize(check.Definition),
                _dateTimeProvider.UtcNow);

            var saved = await _vfxRepository.AddAsync(vfx, cancellationToken);
            await _unitOfWork.SaveChangesAsync(cancellationToken);

            // After the save so the job carries the real id. A failed enqueue never fails
            // the create: the effect is saved and simply has no thumbnail until its next update.
            await VfxThumbnails.TryEnqueueAsync(_thumbnailQueue, _logger, saved.Id, cancellationToken);

            return Result.Success(VfxWriteOutcome.Saved(VfxDetailDto.From(saved)));
        }
        catch (ArgumentException ex)
        {
            return Result.Failure<VfxWriteOutcome>(new Error("VfxCreationFailed", ex.Message));
        }
    }
}
