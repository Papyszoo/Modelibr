using Application.Abstractions.Repositories;
using Application.Search;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

internal sealed class SearchRepository : ISearchRepository
{
    private readonly ApplicationDbContext _context;

    public SearchRepository(ApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<IReadOnlyList<SearchResultGroup>> SearchAsync(
        string term,
        int perTypeLimit,
        CancellationToken cancellationToken = default)
    {
        var pattern = $"%{term.Trim()}%";
        var groups = new List<SearchResultGroup>();

        // Models — match on name OR tag. matched-on prefers a name hit so the
        // palette can explain why a tag-only result surfaced.
        var modelsQuery = _context.Models
            .AsNoTracking()
            .Where(m => !m.IsDeleted)
            .Where(m =>
                EF.Functions.ILike(m.Name, pattern) ||
                m.Tags.Any(t => EF.Functions.ILike(t.Name, pattern)))
            .OrderBy(m => m.Name)
            .Select(m => new SearchResultItem(
                "model",
                m.Id,
                m.Name,
                EF.Functions.ILike(m.Name, pattern) ? "name" : "tag"));
        await AddGroupAsync(groups, "model", perTypeLimit, modelsQuery, cancellationToken);

        await AddGroupAsync(groups, "textureSet", perTypeLimit,
            _context.TextureSets.AsNoTracking()
                .Where(ts => !ts.IsDeleted && EF.Functions.ILike(ts.Name, pattern))
                .OrderBy(ts => ts.Name)
                .Select(ts => new SearchResultItem("textureSet", ts.Id, ts.Name, "name")),
            cancellationToken);

        await AddGroupAsync(groups, "environmentMap", perTypeLimit,
            _context.EnvironmentMaps.AsNoTracking()
                .Where(e => !e.IsDeleted && EF.Functions.ILike(e.Name, pattern))
                .OrderBy(e => e.Name)
                .Select(e => new SearchResultItem("environmentMap", e.Id, e.Name, "name")),
            cancellationToken);

        await AddGroupAsync(groups, "sprite", perTypeLimit,
            _context.Sprites.AsNoTracking()
                .Where(s => !s.IsDeleted && EF.Functions.ILike(s.Name, pattern))
                .OrderBy(s => s.Name)
                .Select(s => new SearchResultItem("sprite", s.Id, s.Name, "name")),
            cancellationToken);

        await AddGroupAsync(groups, "sound", perTypeLimit,
            _context.Sounds.AsNoTracking()
                .Where(s => !s.IsDeleted && EF.Functions.ILike(s.Name, pattern))
                .OrderBy(s => s.Name)
                .Select(s => new SearchResultItem("sound", s.Id, s.Name, "name")),
            cancellationToken);

        await AddGroupAsync(groups, "script", perTypeLimit,
            _context.Scripts.AsNoTracking()
                .Where(s => !s.IsDeleted && EF.Functions.ILike(s.Name, pattern))
                .OrderBy(s => s.Name)
                .Select(s => new SearchResultItem("script", s.Id, s.Name, "name")),
            cancellationToken);

        await AddGroupAsync(groups, "pack", perTypeLimit,
            _context.Packs.AsNoTracking()
                .Where(p => EF.Functions.ILike(p.Name, pattern))
                .OrderBy(p => p.Name)
                .Select(p => new SearchResultItem("pack", p.Id, p.Name, "name")),
            cancellationToken);

        await AddGroupAsync(groups, "project", perTypeLimit,
            _context.Projects.AsNoTracking()
                .Where(p => EF.Functions.ILike(p.Name, pattern))
                .OrderBy(p => p.Name)
                .Select(p => new SearchResultItem("project", p.Id, p.Name, "name")),
            cancellationToken);

        return groups;
    }

    private static async Task AddGroupAsync(
        List<SearchResultGroup> groups,
        string type,
        int perTypeLimit,
        IQueryable<SearchResultItem> query,
        CancellationToken cancellationToken)
    {
        // Deliberately a separate COUNT before the capped fetch: it keeps
        // totalCount exact so the palette can show "N total" when results are
        // truncated. Two round-trips per matched type is fine for a local-first,
        // single-user, debounced search; we don't trade the exact count away.
        var total = await query.CountAsync(cancellationToken);
        if (total == 0)
        {
            return;
        }

        var items = await query.Take(perTypeLimit).ToListAsync(cancellationToken);
        groups.Add(new SearchResultGroup(type, total, items));
    }
}
