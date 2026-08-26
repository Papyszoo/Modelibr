using Application.Abstractions.Repositories;
using Domain.Models;
using Domain.Scenes;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

internal sealed class SceneAssetUsageRepository : ISceneAssetUsageRepository
{
    private readonly ApplicationDbContext _context;

    public SceneAssetUsageRepository(ApplicationDbContext context)
    {
        _context = context;
    }

    public async Task ReplaceForSceneAsync(
        int sceneId, IReadOnlyList<SceneAssetUsage> rows, CancellationToken cancellationToken = default)
    {
        var existing = await _context.SceneAssetUsages
            .Where(u => u.SceneId == sceneId)
            .ToListAsync(cancellationToken);

        if (existing.Count > 0)
        {
            _context.SceneAssetUsages.RemoveRange(existing);
        }

        if (rows.Count > 0)
        {
            _context.SceneAssetUsages.AddRange(rows);
        }

        // Deliberately not saved here. These rows describe the document being written in the
        // same request, and committing them separately would open a window where the two
        // disagree - or leave the projection updated for a document that then failed to save.
    }

    public async Task<IReadOnlyList<ProjectSceneAssetUsage>> ForProjectAsync(
        int projectId, CancellationToken cancellationToken = default)
    {
        var rows = await _context.SceneAssetUsages
            .AsNoTracking()
            .Where(u => u.Scene.ProjectId == projectId)
            .Select(u => new { u.AssetType, u.AssetId, SceneName = u.Scene.Name })
            .ToListAsync(cancellationToken);

        if (rows.Count == 0)
        {
            return Array.Empty<ProjectSceneAssetUsage>();
        }

        var names = await NamesOfAsync(rows.Select(r => (r.AssetType, r.AssetId)), cancellationToken);

        return rows
            .GroupBy(r => (r.AssetType, r.AssetId))
            .Select(g => new ProjectSceneAssetUsage(
                g.Key.AssetType,
                g.Key.AssetId,
                names.TryGetValue(g.Key, out var name) ? name : null,
                g.Select(r => r.SceneName).Distinct(StringComparer.Ordinal).OrderBy(n => n, StringComparer.Ordinal).ToList(),
                g.Count()))
            .OrderBy(u => u.AssetType, StringComparer.Ordinal)
            .ThenBy(u => u.AssetId)
            .ToList();
    }

    public async Task<IReadOnlyList<SceneUsingAsset>> ScenesUsingAsync(
        string assetType, int assetId, CancellationToken cancellationToken = default)
    {
        var type = assetType?.Trim() ?? string.Empty;

        // Grouped in memory rather than in SQL: EF cannot translate a GROUP BY projected onto
        // a constructor, and the row count per asset is a handful of nodes, not a scan.
        var rows = await _context.SceneAssetUsages
            .AsNoTracking()
            .Where(u => u.AssetType == type && u.AssetId == assetId)
            .Select(u => new { u.SceneId, SceneName = u.Scene.Name, u.Scene.ProjectId })
            .ToListAsync(cancellationToken);

        return rows
            .GroupBy(r => (r.SceneId, r.SceneName, r.ProjectId))
            .Select(g => new SceneUsingAsset(g.Key.SceneId, g.Key.SceneName, g.Key.ProjectId, g.Count()))
            .OrderBy(s => s.SceneName, StringComparer.Ordinal)
            .ToList();
    }

    /// <summary>
    /// Names for the referenced assets, one query per family rather than one per asset.
    /// </summary>
    /// <remarks>
    /// An asset that no longer resolves is simply absent: a scene outlives an asset the user
    /// recycled, and the row still records that the scene points at it. Reporting a null name
    /// beats dropping the row, which would make the project's list quietly disagree with the
    /// scene the user can still open.
    /// </remarks>
    private async Task<Dictionary<(string AssetType, int AssetId), string>> NamesOfAsync(
        IEnumerable<(string AssetType, int AssetId)> references,
        CancellationToken cancellationToken)
    {
        var byType = references
            .Distinct()
            .GroupBy(r => r.AssetType, StringComparer.Ordinal)
            .ToDictionary(g => g.Key, g => g.Select(r => r.AssetId).Distinct().ToList(), StringComparer.Ordinal);

        var names = new Dictionary<(string, int), string>();

        if (byType.TryGetValue(SceneAssetTypes.Model, out var modelIds))
        {
            foreach (var m in await _context.Models.AsNoTracking()
                         .Where(m => modelIds.Contains(m.Id))
                         .Select(m => new { m.Id, m.Name })
                         .ToListAsync(cancellationToken))
            {
                names[(SceneAssetTypes.Model, m.Id)] = m.Name;
            }
        }

        if (byType.TryGetValue(SceneAssetTypes.Sprite, out var spriteIds))
        {
            foreach (var s in await _context.Sprites.AsNoTracking()
                         .Where(s => spriteIds.Contains(s.Id))
                         .Select(s => new { s.Id, s.Name })
                         .ToListAsync(cancellationToken))
            {
                names[(SceneAssetTypes.Sprite, s.Id)] = s.Name;
            }
        }

        if (byType.TryGetValue(SceneAssetTypes.EnvironmentMap, out var envIds))
        {
            foreach (var e in await _context.EnvironmentMaps.AsNoTracking()
                         .Where(e => envIds.Contains(e.Id))
                         .Select(e => new { e.Id, e.Name })
                         .ToListAsync(cancellationToken))
            {
                names[(SceneAssetTypes.EnvironmentMap, e.Id)] = e.Name;
            }
        }

        return names;
    }
}
