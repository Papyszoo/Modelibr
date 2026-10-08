using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Models;
using SharedKernel;

namespace Application.Projects;

/// <summary>The asset families an agent can add to or remove from a project by type name.</summary>
public static class ProjectAssetTypes
{
    public const string Model = "model";
    public const string TextureSet = "textureSet";
    public const string Sprite = "sprite";
    public const string Sound = "sound";
    public const string EnvironmentMap = "environmentMap";
    public const string Vfx = "vfx";

    public static IReadOnlyList<string> All { get; } =
        [Model, TextureSet, Sprite, Sound, EnvironmentMap, Vfx];

    /// <summary>
    /// Accepts any casing and <c>-</c>/<c>_</c>/space separators ("Texture Set",
    /// "texture-set"), so the spelling an agent copies from another tool still resolves.
    /// </summary>
    public static string? Normalize(string? assetType)
    {
        if (string.IsNullOrWhiteSpace(assetType)) return null;

        var compact = new string(assetType.Where(c => c is not ('-' or '_' or ' ')).ToArray());
        return All.FirstOrDefault(type => string.Equals(type, compact, StringComparison.OrdinalIgnoreCase));
    }

    public static Error Unknown(string assetType) => new(
        "UnknownProjectAssetType",
        $"'{assetType}' is not an asset type a project holds. Use one of: {string.Join(", ", All)}.");
}

/// <summary>Adds one asset to a project, whatever its family.</summary>
public sealed record AddAssetToProjectCommand(int ProjectId, string AssetType, int AssetId)
    : ICommand<AddAssetToProjectResponse>;

/// <param name="WasMember">
/// The asset was already in the project, so the add changed nothing - and undoing it must
/// not remove a membership it never created.
/// </param>
public sealed record AddAssetToProjectResponse(int ProjectId, string AssetType, int AssetId, bool WasMember);

/// <summary>Removes one asset from a project, whatever its family.</summary>
public sealed record RemoveAssetFromProjectCommand(int ProjectId, string AssetType, int AssetId) : ICommand;

/// <summary>
/// Routes to the per-family add handler the UI uses, so an agent's add behaves exactly like
/// the user's (a model add also tags its batch upload with the project, for instance).
/// </summary>
internal sealed class AddAssetToProjectCommandHandler
    : ICommandHandler<AddAssetToProjectCommand, AddAssetToProjectResponse>
{
    private readonly IProjectRepository _projects;
    private readonly ICommandHandler<AddModelToProjectCommand> _addModel;
    private readonly ICommandHandler<AddTextureSetToProjectCommand> _addTextureSet;
    private readonly ICommandHandler<AddSpriteToProjectCommand> _addSprite;
    private readonly ICommandHandler<AddSoundToProjectCommand> _addSound;
    private readonly ICommandHandler<AddEnvironmentMapToProjectCommand> _addEnvironmentMap;
    private readonly ICommandHandler<AddVfxToProjectCommand> _addVfx;

    public AddAssetToProjectCommandHandler(
        IProjectRepository projects,
        ICommandHandler<AddModelToProjectCommand> addModel,
        ICommandHandler<AddTextureSetToProjectCommand> addTextureSet,
        ICommandHandler<AddSpriteToProjectCommand> addSprite,
        ICommandHandler<AddSoundToProjectCommand> addSound,
        ICommandHandler<AddEnvironmentMapToProjectCommand> addEnvironmentMap,
        ICommandHandler<AddVfxToProjectCommand> addVfx)
    {
        _projects = projects;
        _addModel = addModel;
        _addTextureSet = addTextureSet;
        _addSprite = addSprite;
        _addSound = addSound;
        _addEnvironmentMap = addEnvironmentMap;
        _addVfx = addVfx;
    }

    public async Task<Result<AddAssetToProjectResponse>> Handle(
        AddAssetToProjectCommand command,
        CancellationToken cancellationToken)
    {
        var assetType = ProjectAssetTypes.Normalize(command.AssetType);
        if (assetType is null)
            return Result.Failure<AddAssetToProjectResponse>(ProjectAssetTypes.Unknown(command.AssetType));

        var project = await _projects.GetByIdAsync(command.ProjectId, cancellationToken);
        if (project is null)
            return Result.Failure<AddAssetToProjectResponse>(new Error(
                "ProjectNotFound", $"Project with ID {command.ProjectId} was not found."));

        var wasMember = IsMember(project, assetType, command.AssetId);
        var (projectId, assetId) = (command.ProjectId, command.AssetId);
        var result = assetType switch
        {
            ProjectAssetTypes.Model => await _addModel.Handle(new AddModelToProjectCommand(projectId, assetId), cancellationToken),
            ProjectAssetTypes.TextureSet => await _addTextureSet.Handle(new AddTextureSetToProjectCommand(projectId, assetId), cancellationToken),
            ProjectAssetTypes.Sprite => await _addSprite.Handle(new AddSpriteToProjectCommand(projectId, assetId), cancellationToken),
            ProjectAssetTypes.Sound => await _addSound.Handle(new AddSoundToProjectCommand(projectId, assetId), cancellationToken),
            ProjectAssetTypes.EnvironmentMap => await _addEnvironmentMap.Handle(new AddEnvironmentMapToProjectCommand(projectId, assetId), cancellationToken),
            _ => await _addVfx.Handle(new AddVfxToProjectCommand(projectId, assetId), cancellationToken),
        };

        return result.IsFailure
            ? Result.Failure<AddAssetToProjectResponse>(result.Error)
            : Result.Success(new AddAssetToProjectResponse(projectId, assetType, assetId, wasMember));
    }

    private static bool IsMember(Project project, string assetType, int assetId) => assetType switch
    {
        ProjectAssetTypes.Model => project.HasModel(assetId),
        ProjectAssetTypes.TextureSet => project.HasTextureSet(assetId),
        ProjectAssetTypes.Sprite => project.HasSprite(assetId),
        ProjectAssetTypes.Sound => project.HasSound(assetId),
        ProjectAssetTypes.EnvironmentMap => project.HasEnvironmentMap(assetId),
        _ => project.HasVfx(assetId),
    };
}

internal sealed class RemoveAssetFromProjectCommandHandler : ICommandHandler<RemoveAssetFromProjectCommand>
{
    private readonly ICommandHandler<RemoveModelFromProjectCommand> _removeModel;
    private readonly ICommandHandler<RemoveTextureSetFromProjectCommand> _removeTextureSet;
    private readonly ICommandHandler<RemoveSpriteFromProjectCommand> _removeSprite;
    private readonly ICommandHandler<RemoveSoundFromProjectCommand> _removeSound;
    private readonly ICommandHandler<RemoveEnvironmentMapFromProjectCommand> _removeEnvironmentMap;
    private readonly ICommandHandler<RemoveVfxFromProjectCommand> _removeVfx;

    public RemoveAssetFromProjectCommandHandler(
        ICommandHandler<RemoveModelFromProjectCommand> removeModel,
        ICommandHandler<RemoveTextureSetFromProjectCommand> removeTextureSet,
        ICommandHandler<RemoveSpriteFromProjectCommand> removeSprite,
        ICommandHandler<RemoveSoundFromProjectCommand> removeSound,
        ICommandHandler<RemoveEnvironmentMapFromProjectCommand> removeEnvironmentMap,
        ICommandHandler<RemoveVfxFromProjectCommand> removeVfx)
    {
        _removeModel = removeModel;
        _removeTextureSet = removeTextureSet;
        _removeSprite = removeSprite;
        _removeSound = removeSound;
        _removeEnvironmentMap = removeEnvironmentMap;
        _removeVfx = removeVfx;
    }

    public async Task<Result> Handle(RemoveAssetFromProjectCommand command, CancellationToken cancellationToken)
    {
        var (projectId, assetId) = (command.ProjectId, command.AssetId);
        return ProjectAssetTypes.Normalize(command.AssetType) switch
        {
            ProjectAssetTypes.Model => await _removeModel.Handle(new RemoveModelFromProjectCommand(projectId, assetId), cancellationToken),
            ProjectAssetTypes.TextureSet => await _removeTextureSet.Handle(new RemoveTextureSetFromProjectCommand(projectId, assetId), cancellationToken),
            ProjectAssetTypes.Sprite => await _removeSprite.Handle(new RemoveSpriteFromProjectCommand(projectId, assetId), cancellationToken),
            ProjectAssetTypes.Sound => await _removeSound.Handle(new RemoveSoundFromProjectCommand(projectId, assetId), cancellationToken),
            ProjectAssetTypes.EnvironmentMap => await _removeEnvironmentMap.Handle(new RemoveEnvironmentMapFromProjectCommand(projectId, assetId), cancellationToken),
            ProjectAssetTypes.Vfx => await _removeVfx.Handle(new RemoveVfxFromProjectCommand(projectId, assetId), cancellationToken),
            _ => Result.Failure(ProjectAssetTypes.Unknown(command.AssetType)),
        };
    }
}
