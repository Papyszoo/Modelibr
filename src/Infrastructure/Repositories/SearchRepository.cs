using Application.Abstractions.Repositories;
using Application.Search;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

internal sealed class SearchRepository : ISearchRepository
{
    // Trigram similarity above which a fuzzy identifier match counts. Calibrated on a
    // 1,700-model library: at the old 0.2 the query "strt" confidently returned "strap"
    // and "straw". Fuzzy is a typo-recovery mechanism, so it is also gated on a
    // single-word query of at least MinFuzzyLength characters - a multi-word brief must
    // never be answered by whole-string similarity noise.
    private const double TrigramThreshold = 0.45;
    private const int MinFuzzyLength = 4;

    // Shortest query word allowed to match as an unanchored substring of a display name.
    private const int MinSubstringLength = 4;

    // How many ranked documents to pull per requested hit before collapsing them to one
    // row per asset. An asset contributes one document plus one per part, so a small
    // multiple is enough to fill the page without a second round trip.
    private const int AssetGroupingOverfetch = 4;

    // Degenerate nodes (empty exporter leftovers) are real documents but never a real
    // answer: "car under 10k tris" used to return an 8-triangle, 0x0x0 m "car-01" first,
    // and "vehicle" ranked it above every actual vehicle. Zero measured volume is the
    // reliable signal - a triangle floor alone is not, since such nodes routinely carry a
    // handful of triangles while a legitimate flat asset (a decal, a plane) carries two.
    private const int MinMeaningfulTriangles = 2;

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
        var parsed = SearchQueryParser.Parse(term);

        var query = _context.AssetSearchDocuments
            .AsNoTracking()
            .Where(d => d.IsCurrentVersion) // version-scoping, enforced here in one place
            .Where(d => d.IsActive)         // recycled assets/versions are never a result
            .Where(d => d.TriangleCount == null || d.TriangleCount >= MinMeaningfulTriangles)
            .Where(d => d.MaxDimension == null || d.MaxDimension > 0);

        // Prominence gate: full only by default; secondary reachable when targeted; never hidden.
        // Per-document by design - it is a property of the part, not the asset.
        query = request.IncludeSecondary
            ? query.Where(d => d.Prominence != "hidden")
            : query.Where(d => d.Prominence == "full");

        if (!string.IsNullOrWhiteSpace(request.AssetType))
        {
            query = query.Where(d => d.AssetType == request.AssetType);
        }

        // Structural filters describe the WHOLE ASSET, so they are evaluated against the
        // asset-level document and then used to admit or reject all of that asset's rows.
        //
        // Applying them per-document was wrong in both directions. A part document only
        // carries triangles/vertices/UVs - everything else is null - so "under 10k tris"
        // passed a 4-million-triangle asset on the strength of one small part, and
        // hasRig=false passed a rigged model because its parts have a null BoneCount.
        // Conversely, category is only stamped on the asset document, so a category
        // filter silently dropped every part hit.
        var assetLevel = _context.AssetSearchDocuments
            .AsNoTracking()
            .Where(d => d.PartPath == null && d.IsCurrentVersion && d.IsActive);
        var hasStructuralFilter = false;

        void Restrict(Func<IQueryable<Domain.Models.AssetSearchDocument>, IQueryable<Domain.Models.AssetSearchDocument>> apply)
        {
            assetLevel = apply(assetLevel);
            hasStructuralFilter = true;
        }

        if (request.MinTriangles is int min)
        {
            Restrict(q => q.Where(d => d.TriangleCount >= min));
        }
        if (request.MaxTriangles is int max)
        {
            Restrict(q => q.Where(d => d.TriangleCount <= max));
        }
        if (request.HasAnimations is bool anim)
        {
            Restrict(q => q.Where(d => d.HasAnimations == anim));
        }
        if (!string.IsNullOrWhiteSpace(request.ShapeClass))
        {
            Restrict(q => q.Where(d => d.ShapeClass == request.ShapeClass));
        }
        if (!string.IsNullOrWhiteSpace(request.Engine))
        {
            Restrict(q => q.Where(d => d.Engine == request.Engine));
        }

        // prompt-29 attribute filters ------------------------------------------------
        if (request.MinSize is double minSize)
        {
            Restrict(q => q.Where(d => d.MaxDimension >= minSize));
        }
        if (request.MaxSize is double maxSize)
        {
            Restrict(q => q.Where(d => d.MaxDimension <= maxSize));
        }
        if (request.HasRig is bool hasRig)
        {
            Restrict(q => hasRig
                ? q.Where(d => d.BoneCount > 0)
                : q.Where(d => d.BoneCount == null || d.BoneCount == 0));
        }
        if (request.MinBones is int minBones)
        {
            Restrict(q => q.Where(d => d.BoneCount >= minBones));
        }
        if (request.MaxBones is int maxBones)
        {
            Restrict(q => q.Where(d => d.BoneCount <= maxBones));
        }
        if (request.MinMaterials is int minMat)
        {
            Restrict(q => q.Where(d => d.MaterialCount >= minMat));
        }
        if (request.MaxMaterials is int maxMat)
        {
            Restrict(q => q.Where(d => d.MaterialCount <= maxMat));
        }
        if (request.HasUvs is bool hasUvs)
        {
            Restrict(q => q.Where(d => d.HasUvs == hasUvs));
        }
        if (!string.IsNullOrWhiteSpace(request.UvStatus))
        {
            // Exact match on a closed vocabulary, unlike the category filter's partial
            // match: these are five fixed values a caller picks from, so a substring match
            // would only create ways to select the wrong one.
            var uvStatus = request.UvStatus.Trim();
            Restrict(q => q.Where(d => d.UvStatus == uvStatus));
        }
        if (request.MinParts is int minParts)
        {
            Restrict(q => q.Where(d => d.PartCount >= minParts));
        }
        if (request.MaxParts is int maxParts)
        {
            Restrict(q => q.Where(d => d.PartCount <= maxParts));
        }
        if (request.MinVertices is int minVerts)
        {
            Restrict(q => q.Where(d => d.VertexCount >= minVerts));
        }
        if (request.MaxVertices is int maxVerts)
        {
            Restrict(q => q.Where(d => d.VertexCount <= maxVerts));
        }
        if (!string.IsNullOrWhiteSpace(request.Category))
        {
            // Match the assigned category by name (case-insensitive, partial), so an
            // agent can filter by "weapon" and hit a "Sci-Fi Weapons" category too.
            var categoryPattern = "%" + request.Category.Trim() + "%";
            Restrict(q => q.Where(d => d.CategoryName != null && EF.Functions.ILike(d.CategoryName, categoryPattern)));
        }

        if (hasStructuralFilter)
        {
            // Snapshot before the closure so the EXISTS subquery is the fully-built one.
            var qualifyingAssets = assetLevel;
            query = query.Where(d => qualifyingAssets.Any(a =>
                a.AssetType == d.AssetType &&
                a.AssetId == d.AssetId &&
                a.VersionId == d.VersionId));
        }

        // Filter-only browse: a blank query means "everything that passes the filters",
        // so an agent can ask for "every rigged asset" without inventing a word. This
        // used to return nothing, which made every facet in list_facets unusable alone.
        if (parsed.IsEmpty)
        {
            var browseLimit = Math.Clamp(request.Limit, 1, 100);
            var browseTotal = await query
                .Select(d => new { d.AssetType, d.AssetId })
                .Distinct()
                .CountAsync(cancellationToken);
            var browseDocs = await query
                .OrderByDescending(d => d.PartPath == null) // whole assets before parts
                .ThenBy(d => d.DisplayName)
                .Take(browseLimit * AssetGroupingOverfetch)
                .ToListAsync(cancellationToken);
            var browseHits = browseDocs
                .GroupBy(d => (d.AssetType, d.AssetId))
                .Select(g => g.First())
                .Take(browseLimit)
                .Select(d => ToHit(d))
                .ToList();
            return new AssetSearchResponse(browseHits, browseTotal);
        }

        // Per-word matching with coverage ranking. Each query word is scored on its own
        // (against the indexed tokens, their singular form, and the display name) and a
        // document matching MORE words ranks higher. The previous implementation matched
        // the whole phrase contiguously or not at all, which left multi-word queries to
        // be decided by whole-blob trigram similarity - noise that sometimes landed and
        // sometimes returned an arm bone for "streetlight for a city street".
        //
        // Unrolled to a fixed six slots because EF Core must translate a static shape;
        // unused slots get a pattern that cannot match.
        const string NeverMatches = "__no_match__";
        string Boundary(int i, int variant)
        {
            if (i >= parsed.Terms.Count) return NeverMatches;
            var variants = parsed.Terms[i].Variants;
            if (variant >= variants.Count) return NeverMatches;
            return "% " + variants[variant] + " %";
        }
        // Unanchored substring match on the display name - a fallback for names the
        // tokenizer split differently ("Mailbox" for "box"). Two rules keep it from
        // becoming noise:
        //   * minimum length, because a short word matches inside unrelated names -
        //     "low" in "low poly car" pulled "SM_Env_Flower_01" to rank 2;
        //   * the singular form, so "boxes" reaches "Mailbox" the same way "box" does
        //     (matching the literal plural found 63 assets where the singular found 88).
        string Substring(int i)
        {
            if (i >= parsed.Terms.Count) return NeverMatches;
            var variants = parsed.Terms[i].Variants;
            var shortest = variants[^1];
            return shortest.Length >= MinSubstringLength ? "%" + shortest + "%" : NeverMatches;
        }

        string b00 = Boundary(0, 0), b01 = Boundary(0, 1), s0 = Substring(0);
        string b10 = Boundary(1, 0), b11 = Boundary(1, 1), s1 = Substring(1);
        string b20 = Boundary(2, 0), b21 = Boundary(2, 1), s2 = Substring(2);
        string b30 = Boundary(3, 0), b31 = Boundary(3, 1), s3 = Substring(3);
        string b40 = Boundary(4, 0), b41 = Boundary(4, 1), s4 = Substring(4);
        string b50 = Boundary(5, 0), b51 = Boundary(5, 1), s5 = Substring(5);

        // Fuzzy is typo recovery only: one word, long enough to be meaningful, and well
        // above the similarity floor. It can introduce results; it can never outrank a
        // literal match.
        var fuzzyAllowed = parsed.IsSingleTerm && parsed.Terms[0].Word.Length >= MinFuzzyLength;
        var fuzzyTerm = fuzzyAllowed ? parsed.Terms[0].Word : NeverMatches;

        var scored = query.Select(d => new
        {
            Doc = d,
            // Authored tags join the top tier alongside filename tokens and the display
            // name. A tag is the most deliberate statement of what an asset is that the
            // library holds - someone typed it about this specific model - so a tag match
            // has to be able to admit and rank a document on its own, not merely break a
            // tie behind a filename that happens to contain the word.
            T0 = EF.Functions.ILike(" " + d.Tokens + " ", b00) || EF.Functions.ILike(" " + d.Tokens + " ", b01)
                 || EF.Functions.ILike(" " + d.Symbols + " ", b00) || EF.Functions.ILike(" " + d.Symbols + " ", b01)
                 || EF.Functions.ILike(" " + d.AuthoredTags + " ", b00) || EF.Functions.ILike(" " + d.AuthoredTags + " ", b01)
                 || EF.Functions.ILike(d.DisplayName, s0),
            T1 = EF.Functions.ILike(" " + d.Tokens + " ", b10) || EF.Functions.ILike(" " + d.Tokens + " ", b11)
                 || EF.Functions.ILike(" " + d.Symbols + " ", b10) || EF.Functions.ILike(" " + d.Symbols + " ", b11)
                 || EF.Functions.ILike(" " + d.AuthoredTags + " ", b10) || EF.Functions.ILike(" " + d.AuthoredTags + " ", b11)
                 || EF.Functions.ILike(d.DisplayName, s1),
            T2 = EF.Functions.ILike(" " + d.Tokens + " ", b20) || EF.Functions.ILike(" " + d.Tokens + " ", b21)
                 || EF.Functions.ILike(" " + d.Symbols + " ", b20) || EF.Functions.ILike(" " + d.Symbols + " ", b21)
                 || EF.Functions.ILike(" " + d.AuthoredTags + " ", b20) || EF.Functions.ILike(" " + d.AuthoredTags + " ", b21)
                 || EF.Functions.ILike(d.DisplayName, s2),
            T3 = EF.Functions.ILike(" " + d.Tokens + " ", b30) || EF.Functions.ILike(" " + d.Tokens + " ", b31)
                 || EF.Functions.ILike(" " + d.Symbols + " ", b30) || EF.Functions.ILike(" " + d.Symbols + " ", b31)
                 || EF.Functions.ILike(" " + d.AuthoredTags + " ", b30) || EF.Functions.ILike(" " + d.AuthoredTags + " ", b31)
                 || EF.Functions.ILike(d.DisplayName, s3),
            T4 = EF.Functions.ILike(" " + d.Tokens + " ", b40) || EF.Functions.ILike(" " + d.Tokens + " ", b41)
                 || EF.Functions.ILike(" " + d.Symbols + " ", b40) || EF.Functions.ILike(" " + d.Symbols + " ", b41)
                 || EF.Functions.ILike(" " + d.AuthoredTags + " ", b40) || EF.Functions.ILike(" " + d.AuthoredTags + " ", b41)
                 || EF.Functions.ILike(d.DisplayName, s4),
            T5 = EF.Functions.ILike(" " + d.Tokens + " ", b50) || EF.Functions.ILike(" " + d.Tokens + " ", b51)
                 || EF.Functions.ILike(" " + d.Symbols + " ", b50) || EF.Functions.ILike(" " + d.Symbols + " ", b51)
                 || EF.Functions.ILike(" " + d.AuthoredTags + " ", b50) || EF.Functions.ILike(" " + d.AuthoredTags + " ", b51)
                 || EF.Functions.ILike(d.DisplayName, s5),
            // The browse summary is a weaker signal than an authored name, so it is
            // scored separately and only ever breaks ties - but it must still admit a
            // document whose text mentions the term, which is recall an agent relies on
            // once assets carry descriptions.
            // The user-written description sits in this tier too: it is authored, but it is
            // a sentence, and a word inside a sentence is weaker evidence than the same word
            // being the asset's name. What matters is that it admits the document at all -
            // a description was previously unsearchable text.
            P0 = EF.Functions.ILike(d.BrowseSummary, s0) || EF.Functions.ILike(d.Description, s0),
            P1 = EF.Functions.ILike(d.BrowseSummary, s1) || EF.Functions.ILike(d.Description, s1),
            P2 = EF.Functions.ILike(d.BrowseSummary, s2) || EF.Functions.ILike(d.Description, s2),
            P3 = EF.Functions.ILike(d.BrowseSummary, s3) || EF.Functions.ILike(d.Description, s3),
            P4 = EF.Functions.ILike(d.BrowseSummary, s4) || EF.Functions.ILike(d.Description, s4),
            P5 = EF.Functions.ILike(d.BrowseSummary, s5) || EF.Functions.ILike(d.Description, s5),
            // Inferred concept labels: recall for intent queries, but ranked below an
            // authored name so "vehicle" puts SM_Veh_Car_Van_01 above boat_ornament.
            C0 = EF.Functions.ILike(" " + d.ConceptLabels + " ", b00)
                 || EF.Functions.ILike(" " + d.ConceptLabels + " ", b01),
            C1 = EF.Functions.ILike(" " + d.ConceptLabels + " ", b10)
                 || EF.Functions.ILike(" " + d.ConceptLabels + " ", b11),
            C2 = EF.Functions.ILike(" " + d.ConceptLabels + " ", b20)
                 || EF.Functions.ILike(" " + d.ConceptLabels + " ", b21),
            C3 = EF.Functions.ILike(" " + d.ConceptLabels + " ", b30)
                 || EF.Functions.ILike(" " + d.ConceptLabels + " ", b31),
            C4 = EF.Functions.ILike(" " + d.ConceptLabels + " ", b40)
                 || EF.Functions.ILike(" " + d.ConceptLabels + " ", b41),
            C5 = EF.Functions.ILike(" " + d.ConceptLabels + " ", b50)
                 || EF.Functions.ILike(" " + d.ConceptLabels + " ", b51),
            // Pack membership: author-written grouping ("POLYGON City", "CC0 Models").
            // Ranked BELOW inferred concepts despite being authored, because a pack is a
            // container, not a description - "The Base Mesh" has 1,360 members, so a
            // pack-name match admits a huge undifferentiated set and must never displace
            // a document that matched on what the asset actually is.
            K0 = EF.Functions.ILike(" " + d.PackNames + " ", b00)
                 || EF.Functions.ILike(" " + d.PackNames + " ", b01),
            K1 = EF.Functions.ILike(" " + d.PackNames + " ", b10)
                 || EF.Functions.ILike(" " + d.PackNames + " ", b11),
            K2 = EF.Functions.ILike(" " + d.PackNames + " ", b20)
                 || EF.Functions.ILike(" " + d.PackNames + " ", b21),
            K3 = EF.Functions.ILike(" " + d.PackNames + " ", b30)
                 || EF.Functions.ILike(" " + d.PackNames + " ", b31),
            K4 = EF.Functions.ILike(" " + d.PackNames + " ", b40)
                 || EF.Functions.ILike(" " + d.PackNames + " ", b41),
            K5 = EF.Functions.ILike(" " + d.PackNames + " ", b50)
                 || EF.Functions.ILike(" " + d.PackNames + " ", b51),
            // Whole-name match on the original phrase: "park bench" should still beat a
            // document that merely carries both words separately. Multi-word queries only
            // - for a single word this just repeats the name match below, and promoting it
            // would rank an incidental substring ("staple" for "aple") above a much better
            // fuzzy match on the real name ("apple").
            PhraseHit = !parsed.IsSingleTerm && EF.Functions.ILike(d.DisplayName, "%" + parsed.Original + "%"),
            // Compare against the display name as well as the token blob: a typo is a
            // misspelling of the NAME ("aple"), and similarity against a long
            // concatenated token list is too diluted to recover it.
            TokenSimilarity = EF.Functions.TrigramsSimilarity(d.Tokens, fuzzyTerm),
            NameSimilarity = EF.Functions.TrigramsSimilarity(d.DisplayName, fuzzyTerm),
        })
        .Select(x => new
        {
            x.Doc,
            x.PhraseHit,
            Similarity = x.TokenSimilarity > x.NameSimilarity ? x.TokenSimilarity : x.NameSimilarity,
            LiteralCoverage = (x.T0 ? 1 : 0) + (x.T1 ? 1 : 0) + (x.T2 ? 1 : 0)
                              + (x.T3 ? 1 : 0) + (x.T4 ? 1 : 0) + (x.T5 ? 1 : 0),
            ProseCoverage = (x.P0 ? 1 : 0) + (x.P1 ? 1 : 0) + (x.P2 ? 1 : 0)
                            + (x.P3 ? 1 : 0) + (x.P4 ? 1 : 0) + (x.P5 ? 1 : 0),
            ConceptCoverage = (x.C0 ? 1 : 0) + (x.C1 ? 1 : 0) + (x.C2 ? 1 : 0)
                              + (x.C3 ? 1 : 0) + (x.C4 ? 1 : 0) + (x.C5 ? 1 : 0),
            PackCoverage = (x.K0 ? 1 : 0) + (x.K1 ? 1 : 0) + (x.K2 ? 1 : 0)
                           + (x.K3 ? 1 : 0) + (x.K4 ? 1 : 0) + (x.K5 ? 1 : 0),
        })
        .Select(x => new
        {
            x.Doc,
            x.PhraseHit,
            x.Similarity,
            x.LiteralCoverage,
            x.ProseCoverage,
            x.ConceptCoverage,
            x.PackCoverage,
            // A confident fuzzy match counts as covering the (single) query word, so a
            // near-miss on the real name competes with an incidental substring hit:
            // "aple" must reach "apple", not stop at "staple".
            Coverage = x.LiteralCoverage + (x.Similarity > TrigramThreshold ? 1 : 0),
        })
        .Where(x => x.Coverage > 0 || x.ConceptCoverage > 0 || x.ProseCoverage > 0
                    || x.PackCoverage > 0);

        // Count assets, not documents. An asset is indexed once for itself and once per
        // part, so the old document count reported "46 chairs" for 17 chairs - and the
        // number changed meaning as soon as a filter was applied, since attributes only
        // live on the asset-level document.
        var total = await scored
            .Select(x => new { x.Doc.AssetType, x.Doc.AssetId })
            .Distinct()
            .CountAsync(cancellationToken);

        var limit = Math.Clamp(request.Limit, 1, 100);

        // Over-fetch, then keep the best-ranked document per asset. The same asset used
        // to occupy several of the caller's top-k slots with itself and its parts, which
        // is wasted context for an agent choosing between candidates.
        var ranked = await scored
            .OrderByDescending(x => x.PhraseHit)   // the whole phrase in the name wins
            .ThenByDescending(x => x.Coverage)     // then: how many query words the NAME matched
            .ThenByDescending(x => x.ConceptCoverage) // then inferred concepts
            .ThenByDescending(x => x.PackCoverage)    // then the pack that contains it
            .ThenByDescending(x => x.Doc.PartPath == null) // whole assets before their parts
            .ThenByDescending(x => x.Similarity)   // a close name match beats an incidental one
            .ThenByDescending(x => x.ProseCoverage) // generated summary text is the weakest signal
            .ThenBy(x => x.Doc.DisplayName)
            .Take(limit * AssetGroupingOverfetch)
            .Select(x => new
            {
                x.Doc,
                MatchedOn = x.PhraseHit ? "phrase"
                    : x.LiteralCoverage > 0 ? "token"
                    : x.Coverage > x.LiteralCoverage ? "fuzzy"
                    : x.ConceptCoverage > 0 ? "concept"
                    : "summary",
            })
            .ToListAsync(cancellationToken);

        var best = ranked
            .GroupBy(x => (x.Doc.AssetType, x.Doc.AssetId))
            .Select(g => g.First())
            .Take(limit)
            .ToList();

        // A hit must describe the thing place_asset can actually place. Where the winning
        // document is a part, its asset-level document is fetched so the hit carries the
        // asset's identity and facts, and the part rides along as evidence. Over-fetching
        // already pulls many asset-level documents in, but not reliably the ones needed -
        // a part can outrank its own parent - so the gaps are filled with one extra query
        // rather than one per hit.
        // Keyed by version as well as asset: the asset-level facts that describe a part
        // match have to come from the same version the part belongs to, or the hit would
        // pair one version's mesh with another version's bounds - the same class of
        // mismatch that made get_asset answer about a version search never offered.
        var partMatches = best.Where(x => x.Doc.PartPath is not null).ToList();
        var assetDocs = ranked
            .Where(x => x.Doc.PartPath is null)
            .GroupBy(x => (x.Doc.AssetType, x.Doc.AssetId, x.Doc.VersionId))
            .ToDictionary(g => g.Key, g => g.First().Doc);

        var missing = partMatches
            .Select(x => (x.Doc.AssetType, x.Doc.AssetId, x.Doc.VersionId))
            .Where(key => !assetDocs.ContainsKey(key))
            .Distinct()
            .ToList();

        if (missing.Count > 0)
        {
            var missingIds = missing.Select(k => k.AssetId).Distinct().ToList();
            var missingTypes = missing.Select(k => k.AssetType).Distinct().ToList();

            var fetched = await _context.AssetSearchDocuments
                .AsNoTracking()
                .Where(d => d.PartPath == null
                            && missingTypes.Contains(d.AssetType)
                            && missingIds.Contains(d.AssetId))
                .ToListAsync(cancellationToken);

            foreach (var doc in fetched)
            {
                assetDocs.TryAdd((doc.AssetType, doc.AssetId, doc.VersionId), doc);
            }
        }

        var hits = best
            .Select(x =>
            {
                if (x.Doc.PartPath is null)
                {
                    return ToHit(x.Doc, x.MatchedOn);
                }

                var part = new MatchedPartView(
                    x.Doc.PartPath,
                    x.Doc.DisplayName,
                    x.Doc.BrowseSummary,
                    x.Doc.Prominence,
                    FactsOf(x.Doc));

                // No asset-level document is a projection gap, not a reason to withhold the
                // hit. Falling back to the part's own document keeps the asset reachable;
                // MatchedPart still marks it as a part match, so nothing claims to be
                // something it is not.
                return assetDocs.TryGetValue((x.Doc.AssetType, x.Doc.AssetId, x.Doc.VersionId), out var assetDoc)
                    ? ToHit(assetDoc, x.MatchedOn) with { MatchedPart = part }
                    : ToHit(x.Doc, x.MatchedOn) with { MatchedPart = part };
            })
            .ToList();

        return new AssetSearchResponse(hits, total);
    }

    /// <summary>
    /// Projects a search document into a hit, carrying the structural facts inline so a
    /// caller can choose between candidates without a follow-up call per hit.
    /// </summary>
    private static AssetSearchHit ToHit(Domain.Models.AssetSearchDocument doc, string matchedOn = "browse") =>
        new(doc.AssetType,
            doc.AssetId,
            doc.VersionId,
            doc.PartPath,
            doc.DisplayName,
            doc.BrowseSummary,
            doc.Prominence,
            matchedOn,
            FactsOf(doc));

    private static AssetSearchFacts FactsOf(Domain.Models.AssetSearchDocument doc) =>
        new(doc.TriangleCount,
            doc.VertexCount,
            doc.PartCount,
            doc.MaterialCount,
            doc.MaxDimension,
            doc.HasUvs,
            doc.BoneCount is > 0,
            doc.BoneCount,
            doc.HasAnimations,
            doc.AnimationCount,
            doc.ShapeClass,
            doc.CategoryName,
            doc.DimensionX is null && doc.DimensionY is null && doc.DimensionZ is null
                ? null
                : new AssetDimensions(doc.DimensionX, doc.DimensionY, doc.DimensionZ),
            doc.ScaleConvention,
            doc.UvStatus);

    public async Task<IReadOnlyList<SearchResultGroup>> SearchAsync(
        string term,
        int perTypeLimit,
        CancellationToken cancellationToken = default)
    {
        var pattern = $"%{term.Trim()}%";
        var groups = new List<SearchResultGroup>();

        // Models - match on name OR tag. matched-on prefers a name hit so the
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
