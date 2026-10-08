using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;
using System.Text.Json;

namespace Application.Vfx;

/// <summary>
/// A patch: every field is optional and an omitted one is left alone. A supplied
/// <c>Definition</c> <b>replaces</b> the whole definition rather than merging into it - an
/// effect is authored as a unit, and a half-merged timeline has no meaning.
/// </summary>
public record UpdateVfxCommand(
    int Id,
    string? Name = null,
    string? Description = null,
    JsonElement? Definition = null) : ICommand<VfxWriteOutcome>;

internal sealed class UpdateVfxCommandHandler : ICommandHandler<UpdateVfxCommand, VfxWriteOutcome>
{
    private readonly IVfxRepository _vfxRepository;
    private readonly IModelRepository _modelRepository;
    private readonly IModelVersionRepository _modelVersionRepository;
    private readonly ISoundRepository _soundRepository;
    private readonly ISpriteRepository _spriteRepository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IUnitOfWork _unitOfWork;

    public UpdateVfxCommandHandler(
        IVfxRepository vfxRepository,
        IModelRepository modelRepository,
        IModelVersionRepository modelVersionRepository,
        ISoundRepository soundRepository,
        ISpriteRepository spriteRepository,
        IDateTimeProvider dateTimeProvider,
        IUnitOfWork unitOfWork)
    {
        _vfxRepository = vfxRepository;
        _modelRepository = modelRepository;
        _modelVersionRepository = modelVersionRepository;
        _soundRepository = soundRepository;
        _spriteRepository = spriteRepository;
        _dateTimeProvider = dateTimeProvider;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result<VfxWriteOutcome>> Handle(
        UpdateVfxCommand command,
        CancellationToken cancellationToken)
    {
        var vfx = await _vfxRepository.GetByIdAsync(command.Id, cancellationToken);
        if (vfx is null)
        {
            return Result.Failure<VfxWriteOutcome>(
                new Error("VfxNotFound", $"Vfx with ID {command.Id} was not found."));
        }

        // Validate the definition before touching the tracked entity: a rejected save must
        // leave the effect exactly as it was, even in memory.
        JsonElement? resolvedDefinition = null;
        if (command.Definition is not null)
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
                return Result.Success(VfxWriteOutcome.Invalid(check.Problems));

            resolvedDefinition = check.Definition;
        }

        var now = _dateTimeProvider.UtcNow;

        try
        {
            if (!string.IsNullOrWhiteSpace(command.Name))
                vfx.Rename(command.Name, now);

            if (command.Description is not null)
                vfx.UpdateDescription(command.Description, now);

            if (resolvedDefinition is { } definition)
                vfx.UpdateDefinition(VfxDefinition.Serialize(definition), now);
        }
        catch (ArgumentException ex)
        {
            return Result.Failure<VfxWriteOutcome>(new Error("VfxUpdateFailed", ex.Message));
        }

        await _vfxRepository.UpdateAsync(vfx, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return Result.Success(VfxWriteOutcome.Saved(VfxDetailDto.From(vfx)));
    }
}
