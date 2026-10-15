using System.Text.Json;
using Application.Abstractions.Repositories;
using Application.Models;

namespace Application.Vfx;

/// <summary>
/// Turns the definition's library references into problems for anything that does not
/// exist, and pins every mesh to a concrete version while it has the models loaded.
/// Structural validation already passed, so every id here is a well-formed integer; this
/// only answers "is it in the library".
/// </summary>
internal static class VfxReferenceChecker
{
    public static async Task<VfxMeshVersionResolution> CheckAsync(
        JsonElement definition,
        IModelRepository models,
        IModelVersionRepository modelVersions,
        ISoundRepository sounds,
        ISpriteRepository sprites,
        CancellationToken cancellationToken)
    {
        var references = VfxDefinition.ExtractReferences(definition);
        var modelIds = Distinct(references, VfxAssetKind.Model);
        var versionIds = Distinct(references, VfxAssetKind.ModelVersion);
        var soundIds = Distinct(references, VfxAssetKind.Sound);
        var spriteIds = Distinct(references, VfxAssetKind.Sprite);

        var identities = modelIds.Count == 0
            ? new List<ModelIdentity>()
            : (await models.GetIdentitiesAsync(modelIds, cancellationToken)).ToList();
        var foundModels = identities.Select(m => m.Id).ToHashSet();

        var foundVersions = versionIds.Count == 0
            ? new HashSet<int>()
            : (await modelVersions.GetByIdsAsync(versionIds, cancellationToken)).Select(v => v.Id).ToHashSet();

        var foundSprites = spriteIds.Count == 0
            ? new HashSet<int>()
            : (await sprites.GetByIdsAsync(spriteIds, cancellationToken)).Select(s => s.Id).ToHashSet();

        var foundSounds = new HashSet<int>();
        foreach (var soundId in soundIds)
        {
            if (await sounds.GetByIdAsync(soundId, cancellationToken) is not null)
                foundSounds.Add(soundId);
        }

        var problems = new List<VfxProblem>();
        foreach (var reference in references)
        {
            var found = reference.Kind switch
            {
                VfxAssetKind.Model => foundModels.Contains(reference.Id),
                VfxAssetKind.ModelVersion => foundVersions.Contains(reference.Id),
                VfxAssetKind.Sound => foundSounds.Contains(reference.Id),
                VfxAssetKind.Sprite => foundSprites.Contains(reference.Id),
                _ => false
            };

            if (!found)
                problems.Add(new VfxProblem(reference.Path, $"{Label(reference.Kind)} {reference.Id} was not found."));
        }

        // A mesh that names no version is pinned to the model's active one, so a saved
        // definition always resolves to exactly one version.
        var resolution = VfxDefinition.ResolveMeshVersions(
            definition, identities.ToDictionary(m => m.Id, m => m.ActiveVersionId));
        problems.AddRange(resolution.Problems);

        return new VfxMeshVersionResolution(resolution.Definition, problems);
    }

    private static IReadOnlyCollection<int> Distinct(
        IReadOnlyList<VfxAssetReference> references, VfxAssetKind kind) =>
        references.Where(r => r.Kind == kind).Select(r => r.Id).Distinct().ToList();

    private static string Label(VfxAssetKind kind) => kind switch
    {
        VfxAssetKind.Model => "Model",
        VfxAssetKind.ModelVersion => "Model version",
        VfxAssetKind.Sound => "Sound",
        VfxAssetKind.Sprite => "Sprite",
        _ => "Asset"
    };
}
