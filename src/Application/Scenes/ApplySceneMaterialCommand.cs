using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Extraction;
using Domain.Scenes;
using SharedKernel;

namespace Application.Scenes;

/// <summary>
/// Binds a texture set to one node, or clears the binding.
///
/// Scene-local by design: this overrides the material for <i>this placement</i> and does
/// not touch the model's default texture set. An agent dressing one wall in a scene must
/// not silently re-skin that wall everywhere else in the library.
/// </summary>
/// <param name="Exact">
/// Treat the supplied fields as the whole binding, so an omitted one means "null", not
/// "unchanged". Without it a binding that had no variant cannot be restored, because a null
/// variant reads as "keep the variant that is there". Undo sets this - it holds the entire
/// previous binding and has to reproduce it, not merge into it.
/// </param>
/// <param name="Slot">
/// The model's own material slot to dress ("cushions"). Null dresses the node's default
/// binding, which covers every slot no override names. Without this a scene could only ever
/// dress a whole node, and the slot model that exists in the library would disappear the
/// moment anyone composed a scene.
/// </param>
public sealed record ApplySceneMaterialCommand(
    int SceneId,
    string NodeId,
    int? TextureSetId = null,
    string? Variant = null,
    bool Clear = false,
    int? ExpectedRevision = null,
    bool Exact = false,
    int? MaterialId = null,
    string? Slot = null) : ICommand<SceneMaterialResponse>;

public sealed record SceneMaterialResponse(
    SceneSummary Scene,
    SceneNodeView Node,
    SceneMaterialBinding? PreviousMaterial);

internal sealed class ApplySceneMaterialCommandHandler
    : ICommandHandler<ApplySceneMaterialCommand, SceneMaterialResponse>
{
    private readonly ISceneWriter _writer;
    private readonly IMaterialRepository _materialRepository;
    private readonly ITextureSetRepository _textureSetRepository;
    private readonly IAssetPartRepository _partRepository;
    private readonly ISceneRepository _sceneRepository;

    public ApplySceneMaterialCommandHandler(
        ISceneWriter writer,
        IMaterialRepository materialRepository,
        ITextureSetRepository textureSetRepository,
        IAssetPartRepository partRepository,
        ISceneRepository sceneRepository)
    {
        _writer = writer;
        _materialRepository = materialRepository;
        _textureSetRepository = textureSetRepository;
        _partRepository = partRepository;
        _sceneRepository = sceneRepository;
    }

    public async Task<Result<SceneMaterialResponse>> Handle(
        ApplySceneMaterialCommand command,
        CancellationToken cancellationToken)
    {
        // Resolved before the write, not inside it. The document validator only ever
        // checked that ids were positive integers and that the shape was well formed, so a
        // material that does not exist, a texture set from another install, or a slot name
        // with a typo all saved cleanly and then rendered as nothing - a silent no-op the
        // agent had no way to distinguish from a successful dressing.
        if (!command.Clear)
        {
            var resolved = await ResolveReferencesAsync(command, cancellationToken);
            if (resolved.IsFailure)
            {
                return Result.Failure<SceneMaterialResponse>(resolved.Error);
            }
        }

        SceneMaterialBinding? previous = null;

        var result = await _writer.ApplyAsync(
            command.SceneId,
            command.ExpectedRevision,
            document =>
            {
                var index = MoveSceneNodeCommandHandler.IndexOfNode(document, command.NodeId);
                if (index < 0)
                {
                    return Result.Failure<SceneDocument>(
                        MoveSceneNodeCommandHandler.NodeNotFound(command.SceneId, command.NodeId));
                }

                var node = document.Nodes[index];
                var slot = string.IsNullOrWhiteSpace(command.Slot) ? null : command.Slot.Trim();

                // A slot dresses one named part of the model; no slot dresses the node's
                // default binding, which covers everything a slot override does not name.
                var slots = node.MaterialSlots?.ToList() ?? new List<SceneMaterialBinding>();
                var slotIndex = slot is null
                    ? -1
                    : slots.FindIndex(b => string.Equals(b.Slot, slot, StringComparison.OrdinalIgnoreCase));

                previous = slot is null
                    ? node.Material
                    : slotIndex >= 0 ? slots[slotIndex] : null;

                if (command.TextureSetId is not null && command.MaterialId is not null)
                {
                    return Result.Failure<SceneDocument>(new Error(
                        "Scene.MaterialAmbiguous",
                        "Pass a materialId or a textureSetId, not both - they are two ways to supply the same surface."));
                }

                SceneMaterialBinding? material;
                if (command.Clear)
                {
                    material = null;
                }
                else if (command.Exact)
                {
                    material = new SceneMaterialBinding(command.TextureSetId, command.Variant, command.MaterialId, slot);
                }
                else if (command.TextureSetId is null && command.Variant is null && command.MaterialId is null)
                {
                    return Result.Failure<SceneDocument>(new Error(
                        "Scene.MaterialEmpty",
                        "Provide a materialId, a textureSetId, a variant, or clear=true. An empty binding is ambiguous between 'no change' and 'remove'."));
                }
                else
                {
                    // Naming one source replaces the other: a caller who asks for a material
                    // has stopped asking for the texture set that was there.
                    var replacesSource = command.TextureSetId is not null || command.MaterialId is not null;

                    material = new SceneMaterialBinding(
                        replacesSource ? command.TextureSetId : previous?.TextureSetId,
                        command.Variant ?? previous?.Variant,
                        replacesSource ? command.MaterialId : previous?.MaterialId,
                        slot);
                }

                var nodes = document.Nodes.ToArray();

                if (slot is null)
                {
                    nodes[index] = node with { Material = material };
                }
                else
                {
                    if (material is null)
                    {
                        if (slotIndex >= 0)
                            slots.RemoveAt(slotIndex);
                    }
                    else if (slotIndex >= 0)
                    {
                        slots[slotIndex] = material;
                    }
                    else
                    {
                        slots.Add(material);
                    }

                    nodes[index] = node with { MaterialSlots = slots.Count == 0 ? null : slots };
                }

                return Result.Success(document with { Nodes = nodes });
            },
            cancellationToken);

        if (result.IsFailure)
        {
            return Result.Failure<SceneMaterialResponse>(result.Error);
        }

        var view = result.Value.View;
        return Result.Success(new SceneMaterialResponse(
            view.Scene,
            view.Nodes.First(n => n.NodeId == command.NodeId),
            previous));
    }

    /// <summary>
    /// Checks that everything the caller named actually exists before the write is attempted.
    /// Each miss is reported as itself - "material 91 does not exist" is actionable in a way
    /// that a scene which saved and then rendered grey is not.
    /// </summary>
    private async Task<Result> ResolveReferencesAsync(
        ApplySceneMaterialCommand command,
        CancellationToken cancellationToken)
    {
        if (command.MaterialId is { } materialId)
        {
            var material = await _materialRepository.GetByIdAsync(materialId, cancellationToken);
            if (material is null)
            {
                return Result.Failure(new Error(
                    "Scene.MaterialNotFound",
                    $"Material {materialId} does not exist. Browse the material library with list_materials."));
            }
        }

        if (command.TextureSetId is { } textureSetId)
        {
            var textureSet = await _textureSetRepository.GetByIdAsync(textureSetId, cancellationToken);
            if (textureSet is null)
            {
                return Result.Failure(new Error(
                    "Scene.TextureSetNotFound",
                    $"Texture set {textureSetId} does not exist."));
            }
        }

        return string.IsNullOrWhiteSpace(command.Slot)
            ? Result.Success()
            : await ValidateSlotAsync(command.SceneId, command.NodeId, command.Slot.Trim(), cancellationToken);
    }

    /// <summary>
    /// Confirms the slot name is one the node's asset actually declares.
    /// </summary>
    /// <remarks>
    /// A misspelled slot used to create a binding for a slot that does not exist: accepted,
    /// stored, and then matched by nothing at render time. Because the alternative failure is
    /// worse - blocking a legitimate dressing on data an older extraction never wrote - an
    /// asset with no recorded slots at all is allowed through. The check only fires when the
    /// asset does declare slots and the requested one is not among them, which is exactly the
    /// case where the name can be proven wrong.
    /// </remarks>
    private async Task<Result> ValidateSlotAsync(
        int sceneId,
        string nodeId,
        string slot,
        CancellationToken cancellationToken)
    {
        var scene = await _sceneRepository.GetByIdAsync(sceneId, cancellationToken);
        if (scene is null)
        {
            // Let the writer report the missing scene - it owns that error, and duplicating
            // it here would give the same condition two different codes.
            return Result.Success();
        }

        var document = SceneDocumentCodec.ParseStored(scene.DocumentJson, sceneId);
        if (document.IsFailure)
        {
            return Result.Success();
        }

        var node = document.Value.Nodes.FirstOrDefault(n => n.Id == nodeId);
        if (node?.Asset is not { } asset)
        {
            // No asset means a primitive, which has no authored slots to check against.
            return Result.Success();
        }

        var parts = await _partRepository.GetForAssetAsync(
            asset.AssetType, asset.AssetId, asset.VersionId, cancellationToken);

        var slots = parts
            .SelectMany(p => AssetPartDetail.MaterialSlots(p.Detail))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(s => s, StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (slots.Count == 0 || slots.Contains(slot, StringComparer.OrdinalIgnoreCase))
        {
            return Result.Success();
        }

        return Result.Failure(new Error(
            "Scene.SlotNotFound",
            $"'{slot}' is not a material slot on {asset.AssetType} {asset.AssetId}. " +
            $"Its slots are: {string.Join(", ", slots)}. Omit slot to dress the whole node."));
    }
}
