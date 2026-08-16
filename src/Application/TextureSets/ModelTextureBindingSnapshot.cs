using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Domain.Services;
using SharedKernel;

namespace Application.TextureSets;

/// <summary>One mapping in a model version's material slot.</summary>
public sealed record ModelVersionTextureMappingSnapshot(int TextureSetId, string MaterialName, string VariantName);

/// <summary>
/// One version's texture bindings for a single material slot, plus the default texture set
/// that version renders with.
/// </summary>
public sealed record ModelVersionBindingSnapshot(
    int ModelVersionId,
    int? DefaultTextureSetId,
    IReadOnlyList<ModelVersionTextureMappingSnapshot> Mappings);

/// <summary>
/// The whole prior state of one material slot across every version of a model.
///
/// This exists because binding a texture set is a <b>multi-version, multi-mapping</b> write:
/// it maps the set into every version of the model, displaces whatever named-material mapping
/// was there, and quietly fills in a version's default texture set wherever that was still
/// null. Recording only the active version's previous default - which is all the undo path
/// had - meant reversing a bind reported success while leaving every other version bound to
/// the set the agent chose. This is what "before" has to mean for that write.
/// </summary>
public sealed record ModelTextureBindingSnapshot(
    int ModelId,
    string MaterialName,
    IReadOnlyList<ModelVersionBindingSnapshot> Versions);

/// <summary>
/// Reads the current bindings of one material slot across every version of a model, so a
/// write that is about to replace them can record what it displaced.
/// </summary>
public sealed record GetModelTextureBindingsQuery(int ModelId, string? MaterialName = null)
    : IQuery<ModelTextureBindingSnapshot>;

internal sealed class GetModelTextureBindingsQueryHandler
    : IQueryHandler<GetModelTextureBindingsQuery, ModelTextureBindingSnapshot>
{
    private readonly IModelVersionRepository _modelVersionRepository;

    public GetModelTextureBindingsQueryHandler(IModelVersionRepository modelVersionRepository)
    {
        _modelVersionRepository = modelVersionRepository;
    }

    public async Task<Result<ModelTextureBindingSnapshot>> Handle(
        GetModelTextureBindingsQuery query,
        CancellationToken cancellationToken)
    {
        var materialName = query.MaterialName ?? string.Empty;
        var versions = await _modelVersionRepository.GetByModelIdAsync(query.ModelId, cancellationToken);

        var snapshots = versions
            .Select(version => new ModelVersionBindingSnapshot(
                version.Id,
                version.DefaultTextureSetId,
                version.TextureMappings
                    .Where(m => m.MaterialName == materialName)
                    .Select(m => new ModelVersionTextureMappingSnapshot(m.TextureSetId, m.MaterialName, m.VariantName))
                    .ToList()))
            .ToList();

        return Result.Success(new ModelTextureBindingSnapshot(query.ModelId, materialName, snapshots));
    }
}

/// <summary>
/// Puts a material slot back exactly as <see cref="GetModelTextureBindingsQuery"/> found it,
/// across every recorded version.
///
/// The slot is cleared and re-filled rather than diffed: the write being undone both added a
/// mapping and removed the ones it displaced, so "remove what was added" and "restore what was
/// removed" are the same operation only if the slot's final contents are stated outright. A
/// version present in the snapshot but absent from the model now is skipped, not failed - a
/// version deleted after the bind is not a reason to refuse to undo the rest.
/// </summary>
public sealed record RestoreModelTextureBindingCommand(ModelTextureBindingSnapshot Snapshot) : ICommand;

internal sealed class RestoreModelTextureBindingCommandHandler
    : ICommandHandler<RestoreModelTextureBindingCommand>
{
    private readonly IModelVersionRepository _modelVersionRepository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IBlendFileGenerator _blendFileGenerator;
    private readonly IBlendFileGenerationQueue _blendFileGenerationQueue;
    private readonly IUnitOfWork _unitOfWork;

    public RestoreModelTextureBindingCommandHandler(
        IModelVersionRepository modelVersionRepository,
        IDateTimeProvider dateTimeProvider,
        IBlendFileGenerator blendFileGenerator,
        IBlendFileGenerationQueue blendFileGenerationQueue,
        IUnitOfWork unitOfWork)
    {
        _modelVersionRepository = modelVersionRepository;
        _dateTimeProvider = dateTimeProvider;
        _blendFileGenerator = blendFileGenerator;
        _blendFileGenerationQueue = blendFileGenerationQueue;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result> Handle(RestoreModelTextureBindingCommand command, CancellationToken cancellationToken)
    {
        var snapshot = command.Snapshot;
        var materialName = snapshot.MaterialName ?? string.Empty;
        var now = _dateTimeProvider.UtcNow;

        foreach (var recorded in snapshot.Versions)
        {
            var version = await _modelVersionRepository.GetByIdAsync(recorded.ModelVersionId, cancellationToken);
            if (version is null)
            {
                continue;
            }

            // ALL of them: the write being undone added a mapping alongside whatever was
            // there for unnamed materials, so removing one match would leave the agent's
            // binding in place next to the restored one.
            await _modelVersionRepository.RemoveAllTextureMappingsByMaterialAsync(
                recorded.ModelVersionId, materialName, cancellationToken);

            foreach (var mapping in recorded.Mappings)
            {
                await _modelVersionRepository.AddTextureMappingAsync(
                    recorded.ModelVersionId, mapping.TextureSetId, mapping.MaterialName, mapping.VariantName, cancellationToken);
            }

            if (version.DefaultTextureSetId != recorded.DefaultTextureSetId)
            {
                version.SetDefaultTextureSet(recorded.DefaultTextureSetId, now);
                await _modelVersionRepository.UpdateAsync(version, cancellationToken);
            }

            _blendFileGenerator.InvalidateCache(snapshot.ModelId, recorded.ModelVersionId);
            _blendFileGenerationQueue.Enqueue(snapshot.ModelId, recorded.ModelVersionId);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}
