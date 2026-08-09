using Application.Abstractions.Repositories;
using Application.Search;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

internal sealed class SearchRepository : ISearchRepository
{
    // Trigram similarity above which a fuzzy identifier match counts (pre-calibration guess).
    private const double TrigramThreshold = 0.2;

    private readonly ApplicationDbContext _context;

    public SearchRepository(ApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<AssetSearchResponse> SearchAssetsAsync(
        AssetSearchRequest request,
        CancellationToken cancellationToken = default)
    {
        var term = request.Term?.Trim() ?? string.Empty;
        if (term.Length == 0)
        {
            return new AssetSearchResponse(Array.Empty<AssetSearchHit>(), 0);
        }

        var query = _context.AssetSearchDocuments
            .AsNoTracking()
            .Where(d => d.IsCurrentVersion); // version-scoping, enforced here in one place

        // Prominence gate: full only by default; secondary reachable when targeted; never hidden.
        query = request.IncludeSecondary
            ? query.Where(d => d.Prominence != "hidden")
            : query.Where(d => d.Prominence == "full");

        if (!string.IsNullOrWhiteSpace(request.AssetType))
        {
            query = query.Where(d => d.AssetType == request.AssetType);
        }
        if (request.MinTriangles is int min)
        {
            query = query.Where(d => d.TriangleCount >= min);
        }
        if (request.MaxTriangles is int max)
        {
            query = query.Where(d => d.TriangleCount <= max);
        }
        if (request.HasAnimations is bool anim)
        {
            query = query.Where(d => d.HasAnimations == anim);
        }
        if (!string.IsNullOrWhiteSpace(request.ShapeClass))
        {
            query = query.Where(d => d.ShapeClass == request.ShapeClass);
        }
        if (!string.IsNullOrWhiteSpace(request.Engine))
        {
            query = query.Where(d => d.Engine == request.Engine);
        }

        // prompt-29 attribute filters ------------------------------------------------
        if (request.MinSize is double minSize)
        {
            query = query.Where(d => d.MaxDimension >= minSize);
        }
        if (request.MaxSize is double maxSize)
        {
            query = query.Where(d => d.MaxDimension <= maxSize);
        }
        if (request.HasRig is bool hasRig)
        {
            query = hasRig
                ? query.Where(d => d.BoneCount > 0)
                : query.Where(d => d.BoneCount == null || d.BoneCount == 0);
        }
        if (request.MinBones is int minBones)
        {
            query = query.Where(d => d.BoneCount >= minBones);
        }
        if (request.MaxBones is int maxBones)
        {
            query = query.Where(d => d.BoneCount <= maxBones);
        }
        if (request.MinMaterials is int minMat)
        {
            query = query.Where(d => d.MaterialCount >= minMat);
        }
        if (request.MaxMaterials is int maxMat)
        {
            query = query.Where(d => d.MaterialCount <= maxMat);
        }
        if (request.HasUvs is bool hasUvs)
        {
            query = query.Where(d => d.HasUvs == hasUvs);
        }
        if (request.MinParts is int minParts)
        {
            query = query.Where(d => d.PartCount >= minParts);
        }
        if (request.MaxParts is int maxParts)
        {
            query = query.Where(d => d.PartCount <= maxParts);
        }
        if (request.MinVertices is int minVerts)
        {
            query = query.Where(d => d.VertexCount >= minVerts);
        }
        if (request.MaxVertices is int maxVerts)
        {
            query = query.Where(d => d.VertexCount <= maxVerts);
        }
        if (!string.IsNullOrWhiteSpace(request.Category))
        {
            // Match the assigned category by name (case-insensitive, partial), so an
            // agent can filter by "weapon" and hit a "Sci-Fi Weapons" category too.
            var categoryPattern = "%" + request.Category.Trim() + "%";
            query = query.Where(d => d.CategoryName != null && EF.Functions.ILike(d.CategoryName, categoryPattern));
        }

        // Word-boundary token/symbol match (literal, multilingual — no stemming);
        // trigram carries the fuzzy match; the tsvector covers prose summaries.
        var boundary = "% " + term + " %";
        var substring = "%" + term + "%";

        var scored = query.Select(d => new
        {
            Doc = d,
            TokenHit = EF.Functions.ILike(" " + d.Tokens + " ", boundary)
                       || EF.Functions.ILike(" " + d.Symbols + " ", boundary),
            NameHit = EF.Functions.ILike(d.DisplayName, substring),
            Similarity = EF.Functions.TrigramsSimilarity(d.Tokens, term),
            ProseHit = EF.Functions.ToTsVector("simple", d.BrowseSummary)
                .Matches(EF.Functions.PlainToTsQuery("simple", term)),
        })
        .Where(x => x.TokenHit || x.NameHit || x.ProseHit || x.Similarity > TrigramThreshold);

        var total = await scored.CountAsync(cancellationToken);

        var hits = await scored
            .OrderByDescending(x => x.TokenHit)   // tokenised names outrank everything
            .ThenByDescending(x => x.NameHit)
            .ThenByDescending(x => x.Similarity)
            .ThenByDescending(x => x.ProseHit)     // substring/prose ranks last
            .ThenBy(x => x.Doc.DisplayName)
            .Take(Math.Clamp(request.Limit, 1, 100))
            .Select(x => new AssetSearchHit(
                x.Doc.AssetType,
                x.Doc.AssetId,
                x.Doc.VersionId,
                x.Doc.PartPath,
                x.Doc.DisplayName,
                x.Doc.BrowseSummary,
                x.Doc.Prominence,
                x.TokenHit ? "token" : x.NameHit ? "name" : x.Similarity > TrigramThreshold ? "fuzzy" : "summary"))
            .ToListAsync(cancellationToken);

        return new AssetSearchResponse(hits, total);
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
