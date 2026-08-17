using Application.Abstractions.Messaging;
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

    public ApplySceneMaterialCommandHandler(ISceneWriter writer)
    {
        _writer = writer;
    }

    public async Task<Result<SceneMaterialResponse>> Handle(
        ApplySceneMaterialCommand command,
        CancellationToken cancellationToken)
    {
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
}
