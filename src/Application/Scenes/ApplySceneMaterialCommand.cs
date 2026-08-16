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
public sealed record ApplySceneMaterialCommand(
    int SceneId,
    string NodeId,
    int? TextureSetId = null,
    string? Variant = null,
    bool Clear = false,
    int? ExpectedRevision = null,
    bool Exact = false) : ICommand<SceneMaterialResponse>;

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
                previous = node.Material;

                SceneMaterialBinding? material;
                if (command.Clear)
                {
                    material = null;
                }
                else if (command.Exact)
                {
                    material = new SceneMaterialBinding(command.TextureSetId, command.Variant);
                }
                else if (command.TextureSetId is null && command.Variant is null)
                {
                    return Result.Failure<SceneDocument>(new Error(
                        "Scene.MaterialEmpty",
                        "Provide a textureSetId, a variant, or clear=true. An empty binding is ambiguous between 'no change' and 'remove'."));
                }
                else
                {
                    material = new SceneMaterialBinding(
                        command.TextureSetId ?? previous?.TextureSetId,
                        command.Variant ?? previous?.Variant);
                }

                var nodes = document.Nodes.ToArray();
                nodes[index] = node with { Material = material };
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
