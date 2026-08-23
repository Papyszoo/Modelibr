using System.Linq.Expressions;
using Application.Abstractions.Repositories;
using Application.Search;
using Domain.Models;
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

    // How many of a project profile's boost/penalty tokens ranking matches. Fixed because EF
    // Core must translate a static shape - the same reason query terms are unrolled to six
    // slots below.
    //
    // Defined FROM the builder's limit rather than beside it: the builder truncates the lists
    // and reports what it dropped, and raising one number without the other would silently
    // ignore tokens the response claims were applied.
    private const int StyleTokenSlots = ProfileSearchBiasBuilder.MaxRankedTokens;

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

        if (request.Styles is { Count: > 0 })
        {
            // Any-of: a brief that says "low poly or voxel" is one filter, not two searches.
            // Overlap on the stored array, which the GIN index serves; the values are the
            // schema's canonical spellings, so no case folding is needed or wanted.
            var styles = request.Styles.Where(s => !string.IsNullOrWhiteSpace(s)).Select(s => s.Trim()).ToArray();
            if (styles.Length > 0)
            {
                Restrict(q => q.Where(d => d.Styles.Any(v => styles.Contains(v))));
            }
        }
        if (request.Themes is { Count: > 0 })
        {
            var themes = request.Themes.Where(t => !string.IsNullOrWhiteSpace(t)).Select(t => t.Trim()).ToArray();
            if (themes.Length > 0)
            {
                Restrict(q => q.Where(d => d.Themes.Any(v => themes.Contains(v))));
            }
        }
        if (!string.IsNullOrWhiteSpace(request.License))
        {
            // Exact, like uvStatus and unlike category: the question is "may I ship this",
            // and a partial match that let CC-BY-NC answer a CC-BY filter would be the one
            // wrong answer with consequences.
            var license = request.License.Trim();
            Restrict(q => q.Where(d => d.License == license));
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

        // The project profile (prompt 13-D3). Two separate things:
        //
        //   * ranking - every document is scored against the profile's style, always, in both
        //     `bias` and `enforce`. This only reorders.
        //   * the triangle cap - a hard filter, and ONLY in `enforce`. A silent hard filter is
        //     the trap here: it produces an agent that concludes the library has no sofas. So
        //     it is applied after scoring rather than folded into the filters above, which is
        //     what lets the same query say how many assets it removed.
        //
        // The cap is evaluated at asset level like every other structural filter - a part's own
        // triangle count says nothing about whether the asset it belongs to fits a budget.
        var profile = request.Profile;
        IQueryable<Domain.Models.AssetSearchDocument>? overBudget = null;
        if (profile is { } p && p.EnforcesBudget)
        {
            var cap = p.TriangleCap!.Value;
            overBudget = _context.AssetSearchDocuments
                .AsNoTracking()
                // An asset with no triangles is not over a triangle budget. Comparing null
                // against the cap would quietly drop every sound and sprite from an enforced
                // search, which is not what a budget means.
                .Where(d => d.PartPath == null && d.IsCurrentVersion && d.IsActive && d.TriangleCount > cap);
        }

        // The style slots, unrolled for the same reason the query terms below are: EF Core
        // translates a static shape. The Application layer has already truncated the profile's
        // token lists to StyleTokenSlots and reported anything that did not fit.
        //
        // Both query paths score with these same locals rather than sharing a projection
        // method: a projection into a named type cannot be consumed downstream by EF, and a
        // style score that differed between the ranked and browse paths would make "search for
        // nothing" and "search for a word" disagree about what the project prefers.
        const string NoStyleToken = "%__no_style_token__%";
        string StyleSlot(IReadOnlyList<string>? tokens, int i)
            => tokens is not null && i < tokens.Count ? "% " + tokens[i] + " %" : NoStyleToken;

        var boostTokens = profile?.BoostTokens;
        var penaltyTokens = profile?.PenaltyTokens;
        System.Diagnostics.Debug.Assert(
            (boostTokens?.Count ?? 0) <= StyleTokenSlots && (penaltyTokens?.Count ?? 0) <= StyleTokenSlots,
            "The profile handed more style tokens than ranking has slots to match them in.");
        string y0 = StyleSlot(boostTokens, 0), y1 = StyleSlot(boostTokens, 1),
               y2 = StyleSlot(boostTokens, 2), y3 = StyleSlot(boostTokens, 3),
               y4 = StyleSlot(boostTokens, 4), y5 = StyleSlot(boostTokens, 5),
               y6 = StyleSlot(boostTokens, 6), y7 = StyleSlot(boostTokens, 7);
        string z0 = StyleSlot(penaltyTokens, 0), z1 = StyleSlot(penaltyTokens, 1),
               z2 = StyleSlot(penaltyTokens, 2), z3 = StyleSlot(penaltyTokens, 3),
               z4 = StyleSlot(penaltyTokens, 4), z5 = StyleSlot(penaltyTokens, 5),
               z6 = StyleSlot(penaltyTokens, 6), z7 = StyleSlot(penaltyTokens, 7);

        // Declared styles are a typed facet, not text, so they are matched as an array overlap
        // - and they are the strongest signal there is: the asset itself says what it is,
        // rather than a word in its filename suggesting it.
        var declaredStyles = profile is null ? Array.Empty<string>() : profile.Styles.ToArray();

        // Filter-only browse: a blank query means "everything that passes the filters",
        // so an agent can ask for "every rigged asset" without inventing a word. This
        // used to return nothing, which made every facet in list_facets unusable alone.
        if (parsed.IsEmpty)
        {
            var browseLimit = Math.Clamp(request.Limit, 1, 100);
            var browseScored = query
                .Select(d => new
                {
                    Doc = d,
                    // The text a style token is matched against, space-padded so a token matches
                    // on word boundaries rather than inside a longer word. Pack names are
                    // deliberately absent: "POLYGON City" contains 696 assets, and letting a
                    // pack carry a style signal would score every member of it identically,
                    // which is the opposite of choosing between them.
                    Blob = " " + d.Tokens + " " + d.AuthoredTags + " " + d.ConceptLabels + " " + d.DisplayName + " ",
                })
                .Select(x => new
                {
                    x.Doc,
                    DeclaresStyle = declaredStyles.Length > 0 && x.Doc.Styles.Any(v => declaredStyles.Contains(v)),
                    BoostHits = (EF.Functions.ILike(x.Blob, y0) ? 1 : 0) + (EF.Functions.ILike(x.Blob, y1) ? 1 : 0)
                                + (EF.Functions.ILike(x.Blob, y2) ? 1 : 0) + (EF.Functions.ILike(x.Blob, y3) ? 1 : 0)
                                + (EF.Functions.ILike(x.Blob, y4) ? 1 : 0) + (EF.Functions.ILike(x.Blob, y5) ? 1 : 0)
                                + (EF.Functions.ILike(x.Blob, y6) ? 1 : 0) + (EF.Functions.ILike(x.Blob, y7) ? 1 : 0),
                    PenaltyHits = (EF.Functions.ILike(x.Blob, z0) ? 1 : 0) + (EF.Functions.ILike(x.Blob, z1) ? 1 : 0)
                                  + (EF.Functions.ILike(x.Blob, z2) ? 1 : 0) + (EF.Functions.ILike(x.Blob, z3) ? 1 : 0)
                                  + (EF.Functions.ILike(x.Blob, z4) ? 1 : 0) + (EF.Functions.ILike(x.Blob, z5) ? 1 : 0)
                                  + (EF.Functions.ILike(x.Blob, z6) ? 1 : 0) + (EF.Functions.ILike(x.Blob, z7) ? 1 : 0),
                });
            var browseKept = overBudget is null
                ? browseScored
                : browseScored.Where(x => !overBudget.Any(a =>
                    a.AssetType == x.Doc.AssetType && a.AssetId == x.Doc.AssetId && a.VersionId == x.Doc.VersionId));

            var browseTotal = await browseKept
                .Select(x => new { x.Doc.AssetType, x.Doc.AssetId })
                .Distinct()
                .CountAsync(cancellationToken);

            int? browseRemoved = null;
            if (overBudget is not null)
            {
                var withoutCap = await browseScored
                    .Select(x => new { x.Doc.AssetType, x.Doc.AssetId })
                    .Distinct()
                    .CountAsync(cancellationToken);
                browseRemoved = withoutCap - browseTotal;
            }

            // A filter-only browse has no relevance to rank by, so the profile is the only
            // ordering signal there is: "everything for this project" should lead with what
            // matches its style rather than with whatever sorts first alphabetically.
            var browseDocs = await browseKept
                .OrderByDescending(x => x.DeclaresStyle)
                .ThenByDescending(x => x.BoostHits)
                .ThenBy(x => x.PenaltyHits)
                .ThenByDescending(x => x.Doc.PartPath == null) // whole assets before parts
                .ThenBy(x => x.Doc.DisplayName)
                .Take(browseLimit * AssetGroupingOverfetch)
                .Select(x => x.Doc)
                .ToListAsync(cancellationToken);
            var browseHits = browseDocs
                .GroupBy(d => (d.AssetType, d.AssetId))
                .Select(g => g.First())
                .Take(browseLimit)
                .Select(d => ToHit(d, "browse", profile))
                .ToList();
            return new AssetSearchResponse(
                browseHits,
                browseTotal,
                profile is null ? null : ProfileSearchBiasBuilder.Describe(profile, browseRemoved));
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

        var scored = query
            .Select(d => new
            {
                Doc = d,
                Blob = " " + d.Tokens + " " + d.AuthoredTags + " " + d.ConceptLabels + " " + d.DisplayName + " ",
            })
            .Select(pd => new
        {
            pd.Doc,
            // The profile's three signals, carried through every stage below so it can decide
            // ties in the ORDER BY without a second pass over the documents.
            DeclaresStyle = declaredStyles.Length > 0 && pd.Doc.Styles.Any(v => declaredStyles.Contains(v)),
            BoostHits = (EF.Functions.ILike(pd.Blob, y0) ? 1 : 0) + (EF.Functions.ILike(pd.Blob, y1) ? 1 : 0)
                        + (EF.Functions.ILike(pd.Blob, y2) ? 1 : 0) + (EF.Functions.ILike(pd.Blob, y3) ? 1 : 0)
                        + (EF.Functions.ILike(pd.Blob, y4) ? 1 : 0) + (EF.Functions.ILike(pd.Blob, y5) ? 1 : 0)
                        + (EF.Functions.ILike(pd.Blob, y6) ? 1 : 0) + (EF.Functions.ILike(pd.Blob, y7) ? 1 : 0),
            PenaltyHits = (EF.Functions.ILike(pd.Blob, z0) ? 1 : 0) + (EF.Functions.ILike(pd.Blob, z1) ? 1 : 0)
                          + (EF.Functions.ILike(pd.Blob, z2) ? 1 : 0) + (EF.Functions.ILike(pd.Blob, z3) ? 1 : 0)
                          + (EF.Functions.ILike(pd.Blob, z4) ? 1 : 0) + (EF.Functions.ILike(pd.Blob, z5) ? 1 : 0)
                          + (EF.Functions.ILike(pd.Blob, z6) ? 1 : 0) + (EF.Functions.ILike(pd.Blob, z7) ? 1 : 0),
            // Authored tags join the top tier alongside filename tokens and the display
            // name. A tag is the most deliberate statement of what an asset is that the
            // library holds - someone typed it about this specific model - so a tag match
            // has to be able to admit and rank a document on its own, not merely break a
            // tie behind a filename that happens to contain the word.
            T0 = EF.Functions.ILike(" " + pd.Doc.Tokens + " ", b00) || EF.Functions.ILike(" " + pd.Doc.Tokens + " ", b01)
                 || EF.Functions.ILike(" " + pd.Doc.Symbols + " ", b00) || EF.Functions.ILike(" " + pd.Doc.Symbols + " ", b01)
                 || EF.Functions.ILike(" " + pd.Doc.AuthoredTags + " ", b00) || EF.Functions.ILike(" " + pd.Doc.AuthoredTags + " ", b01)
                 || EF.Functions.ILike(pd.Doc.DisplayName, s0),
            T1 = EF.Functions.ILike(" " + pd.Doc.Tokens + " ", b10) || EF.Functions.ILike(" " + pd.Doc.Tokens + " ", b11)
                 || EF.Functions.ILike(" " + pd.Doc.Symbols + " ", b10) || EF.Functions.ILike(" " + pd.Doc.Symbols + " ", b11)
                 || EF.Functions.ILike(" " + pd.Doc.AuthoredTags + " ", b10) || EF.Functions.ILike(" " + pd.Doc.AuthoredTags + " ", b11)
                 || EF.Functions.ILike(pd.Doc.DisplayName, s1),
            T2 = EF.Functions.ILike(" " + pd.Doc.Tokens + " ", b20) || EF.Functions.ILike(" " + pd.Doc.Tokens + " ", b21)
                 || EF.Functions.ILike(" " + pd.Doc.Symbols + " ", b20) || EF.Functions.ILike(" " + pd.Doc.Symbols + " ", b21)
                 || EF.Functions.ILike(" " + pd.Doc.AuthoredTags + " ", b20) || EF.Functions.ILike(" " + pd.Doc.AuthoredTags + " ", b21)
                 || EF.Functions.ILike(pd.Doc.DisplayName, s2),
            T3 = EF.Functions.ILike(" " + pd.Doc.Tokens + " ", b30) || EF.Functions.ILike(" " + pd.Doc.Tokens + " ", b31)
                 || EF.Functions.ILike(" " + pd.Doc.Symbols + " ", b30) || EF.Functions.ILike(" " + pd.Doc.Symbols + " ", b31)
                 || EF.Functions.ILike(" " + pd.Doc.AuthoredTags + " ", b30) || EF.Functions.ILike(" " + pd.Doc.AuthoredTags + " ", b31)
                 || EF.Functions.ILike(pd.Doc.DisplayName, s3),
            T4 = EF.Functions.ILike(" " + pd.Doc.Tokens + " ", b40) || EF.Functions.ILike(" " + pd.Doc.Tokens + " ", b41)
                 || EF.Functions.ILike(" " + pd.Doc.Symbols + " ", b40) || EF.Functions.ILike(" " + pd.Doc.Symbols + " ", b41)
                 || EF.Functions.ILike(" " + pd.Doc.AuthoredTags + " ", b40) || EF.Functions.ILike(" " + pd.Doc.AuthoredTags + " ", b41)
                 || EF.Functions.ILike(pd.Doc.DisplayName, s4),
            T5 = EF.Functions.ILike(" " + pd.Doc.Tokens + " ", b50) || EF.Functions.ILike(" " + pd.Doc.Tokens + " ", b51)
                 || EF.Functions.ILike(" " + pd.Doc.Symbols + " ", b50) || EF.Functions.ILike(" " + pd.Doc.Symbols + " ", b51)
                 || EF.Functions.ILike(" " + pd.Doc.AuthoredTags + " ", b50) || EF.Functions.ILike(" " + pd.Doc.AuthoredTags + " ", b51)
                 || EF.Functions.ILike(pd.Doc.DisplayName, s5),
            // The browse summary is a weaker signal than an authored name, so it is
            // scored separately and only ever breaks ties - but it must still admit a
            // document whose text mentions the term, which is recall an agent relies on
            // once assets carry descriptions.
            // The user-written description sits in this tier too: it is authored, but it is
            // a sentence, and a word inside a sentence is weaker evidence than the same word
            // being the asset's name. What matters is that it admits the document at all -
            // a description was previously unsearchable text.
            P0 = EF.Functions.ILike(pd.Doc.BrowseSummary, s0) || EF.Functions.ILike(pd.Doc.Description, s0),
            P1 = EF.Functions.ILike(pd.Doc.BrowseSummary, s1) || EF.Functions.ILike(pd.Doc.Description, s1),
            P2 = EF.Functions.ILike(pd.Doc.BrowseSummary, s2) || EF.Functions.ILike(pd.Doc.Description, s2),
            P3 = EF.Functions.ILike(pd.Doc.BrowseSummary, s3) || EF.Functions.ILike(pd.Doc.Description, s3),
            P4 = EF.Functions.ILike(pd.Doc.BrowseSummary, s4) || EF.Functions.ILike(pd.Doc.Description, s4),
            P5 = EF.Functions.ILike(pd.Doc.BrowseSummary, s5) || EF.Functions.ILike(pd.Doc.Description, s5),
            // Inferred concept labels: recall for intent queries, but ranked below an
            // authored name so "vehicle" puts SM_Veh_Car_Van_01 above boat_ornament.
            C0 = EF.Functions.ILike(" " + pd.Doc.ConceptLabels + " ", b00)
                 || EF.Functions.ILike(" " + pd.Doc.ConceptLabels + " ", b01),
            C1 = EF.Functions.ILike(" " + pd.Doc.ConceptLabels + " ", b10)
                 || EF.Functions.ILike(" " + pd.Doc.ConceptLabels + " ", b11),
            C2 = EF.Functions.ILike(" " + pd.Doc.ConceptLabels + " ", b20)
                 || EF.Functions.ILike(" " + pd.Doc.ConceptLabels + " ", b21),
            C3 = EF.Functions.ILike(" " + pd.Doc.ConceptLabels + " ", b30)
                 || EF.Functions.ILike(" " + pd.Doc.ConceptLabels + " ", b31),
            C4 = EF.Functions.ILike(" " + pd.Doc.ConceptLabels + " ", b40)
                 || EF.Functions.ILike(" " + pd.Doc.ConceptLabels + " ", b41),
            C5 = EF.Functions.ILike(" " + pd.Doc.ConceptLabels + " ", b50)
                 || EF.Functions.ILike(" " + pd.Doc.ConceptLabels + " ", b51),
            // Pack membership: author-written grouping ("POLYGON City", "CC0 Models").
            // Ranked BELOW inferred concepts despite being authored, because a pack is a
            // container, not a description - "The Base Mesh" has 1,360 members, so a
            // pack-name match admits a huge undifferentiated set and must never displace
            // a document that matched on what the asset actually is.
            K0 = EF.Functions.ILike(" " + pd.Doc.PackNames + " ", b00)
                 || EF.Functions.ILike(" " + pd.Doc.PackNames + " ", b01),
            K1 = EF.Functions.ILike(" " + pd.Doc.PackNames + " ", b10)
                 || EF.Functions.ILike(" " + pd.Doc.PackNames + " ", b11),
            K2 = EF.Functions.ILike(" " + pd.Doc.PackNames + " ", b20)
                 || EF.Functions.ILike(" " + pd.Doc.PackNames + " ", b21),
            K3 = EF.Functions.ILike(" " + pd.Doc.PackNames + " ", b30)
                 || EF.Functions.ILike(" " + pd.Doc.PackNames + " ", b31),
            K4 = EF.Functions.ILike(" " + pd.Doc.PackNames + " ", b40)
                 || EF.Functions.ILike(" " + pd.Doc.PackNames + " ", b41),
            K5 = EF.Functions.ILike(" " + pd.Doc.PackNames + " ", b50)
                 || EF.Functions.ILike(" " + pd.Doc.PackNames + " ", b51),
            // Whole-name match on the original phrase: "park bench" should still beat a
            // document that merely carries both words separately. Multi-word queries only
            // - for a single word this just repeats the name match below, and promoting it
            // would rank an incidental substring ("staple" for "aple") above a much better
            // fuzzy match on the real name ("apple").
            PhraseHit = !parsed.IsSingleTerm && EF.Functions.ILike(pd.Doc.DisplayName, "%" + parsed.Original + "%"),
            // Compare against the display name as well as the token blob: a typo is a
            // misspelling of the NAME ("aple"), and similarity against a long
            // concatenated token list is too diluted to recover it.
            TokenSimilarity = EF.Functions.TrigramsSimilarity(pd.Doc.Tokens, fuzzyTerm),
            NameSimilarity = EF.Functions.TrigramsSimilarity(pd.Doc.DisplayName, fuzzyTerm),
        })
        .Select(x => new
        {
            x.Doc,
            x.DeclaresStyle,
            x.BoostHits,
            x.PenaltyHits,
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
            x.DeclaresStyle,
            x.BoostHits,
            x.PenaltyHits,
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

        // The enforced triangle cap, applied after scoring so the two counts below differ by
        // exactly the assets it removed. An agent that gets three results has to be able to
        // see that a cap it did not set is the reason, and relax it.
        var withinBudget = overBudget is null
            ? scored
            : scored.Where(x => !overBudget.Any(a =>
                a.AssetType == x.Doc.AssetType && a.AssetId == x.Doc.AssetId && a.VersionId == x.Doc.VersionId));

        // Count assets, not documents. An asset is indexed once for itself and once per
        // part, so the old document count reported "46 chairs" for 17 chairs - and the
        // number changed meaning as soon as a filter was applied, since attributes only
        // live on the asset-level document.
        var total = await withinBudget
            .Select(x => new { x.Doc.AssetType, x.Doc.AssetId })
            .Distinct()
            .CountAsync(cancellationToken);

        int? removedByBudget = null;
        if (overBudget is not null)
        {
            var withoutCap = await scored
                .Select(x => new { x.Doc.AssetType, x.Doc.AssetId })
                .Distinct()
                .CountAsync(cancellationToken);
            removedByBudget = withoutCap - total;
        }

        var limit = Math.Clamp(request.Limit, 1, 100);

        // Over-fetch, then keep the best-ranked document per asset. The same asset used
        // to occupy several of the caller's top-k slots with itself and its parts, which
        // is wasted context for an agent choosing between candidates.
        var ranked = await withinBudget
            .OrderByDescending(x => x.PhraseHit)   // the whole phrase in the name wins
            .ThenByDescending(x => x.Coverage)     // then: how many query words the NAME matched
            // The project's profile decides between hits the query cannot tell apart, which is
            // the whole of what `bias` does. It sits here, below relevance and above every
            // weaker text signal: a 180k photoscan matches the word "chair" exactly as
            // completely as a low-poly one, so positive boosts alone could never demote it.
            .ThenByDescending(x => x.DeclaresStyle)   // the asset says it IS this style
            .ThenByDescending(x => x.BoostHits)       // then: how much its text reads like it
            .ThenBy(x => x.PenaltyHits)               // and down when it reads like another style
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

        var perAsset = ranked
            .GroupBy(x => (x.Doc.AssetType, x.Doc.AssetId))
            .Select(g => g.First())
            .ToList();

        // Then collapse assets that ARE each other. Game libraries are full of the same prop
        // imported twice - SM_Prop_Couch_01 sits at two ids with byte-identical geometry, and
        // many POLYGON City props are doubled - and nothing in a hit said so, so one couch
        // took two of the caller's ten slots and read as a choice between two things.
        //
        // The survivor is the best-ranked of the group, and the ones behind it come back as
        // AlsoAt rather than being dropped: they are real, separately-tagged, separately-
        // packed assets, and a caller that wants the other id must still be able to see it.
        //
        // Two limits, both from doing this in the page rather than in the index. Duplicates
        // ranked outside the over-fetched window are not compared - in practice identical
        // geometry comes with near-identical names, so they arrive adjacent. And a hit whose
        // winning document was a PART carries no fingerprint (a part is not its asset), so it
        // is never collapsed; the asset-level identity it resolves to is only known further
        // down, after the fill-in query. Both leave a duplicate visible rather than hiding a
        // distinct asset, which is the right direction to fail in.
        var duplicatesOf = new Dictionary<int, List<int>>();
        var winnerByGeometry = new Dictionary<string, int>(StringComparer.Ordinal);
        var kept = new List<int>();

        for (var i = 0; i < perAsset.Count; i++)
        {
            var doc = perAsset[i].Doc;
            var key = doc.GeometryKey;

            // No fingerprint is not a match. Two assets nobody hashed have nothing in common,
            // and treating absence as a shared key would collapse the unhashed half of a
            // library into a single result.
            if (string.IsNullOrEmpty(key))
            {
                kept.Add(i);
                continue;
            }

            if (winnerByGeometry.TryGetValue(key, out var winner))
            {
                duplicatesOf[winner].Add(doc.AssetId);
                continue;
            }

            winnerByGeometry[key] = doc.AssetId;
            duplicatesOf[doc.AssetId] = new List<int>();
            kept.Add(i);
        }

        // The whole window is folded before the page is cut, so a survivor's AlsoAt names
        // every duplicate seen - not only the ones that happened to rank above the limit.
        var best = kept.Take(limit).Select(i => perAsset[i]).ToList();

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

        // Empty stays null on the wire: a hit that names no duplicates should say nothing,
        // not carry an empty list every caller has to check.
        IReadOnlyList<int>? AlsoAtFor(int assetId) =>
            duplicatesOf.TryGetValue(assetId, out var ids) && ids.Count > 0 ? ids : null;

        var hits = best
            .Select(x =>
            {
                var alsoAt = AlsoAtFor(x.Doc.AssetId);

                if (x.Doc.PartPath is null)
                {
                    return ToHit(x.Doc, x.MatchedOn, profile) with { AlsoAt = alsoAt };
                }

                // No profileFit on the part: it is evidence about why the asset came back, and
                // a budget is a property of the thing place_asset would place.
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
                    ? ToHit(assetDoc, x.MatchedOn, profile) with { MatchedPart = part, AlsoAt = alsoAt }
                    : ToHit(x.Doc, x.MatchedOn, profile) with { MatchedPart = part, AlsoAt = alsoAt };
            })
            .ToList();

        return new AssetSearchResponse(
            hits,
            total,
            profile is null ? null : ProfileSearchBiasBuilder.Describe(profile, removedByBudget));
    }

    /// <summary>
    /// The text a style token is matched against, space-padded so a token matches on word
    /// boundaries rather than inside a longer word. The in-memory twin of the blob
    /// <see cref="WithProfileScore"/> builds in SQL - the two have to agree, or a hit would
    /// report tokens other than the ones that moved its rank.
    /// </summary>
    /// <remarks>
    /// Pack names are deliberately absent. "POLYGON City" is a container of 696 assets, and
    /// letting a pack name carry a style signal would score every member of a pack identically
    /// - which is the opposite of choosing between them.
    /// </remarks>
    private static string StyleBlob(Domain.Models.AssetSearchDocument d)
        => " " + d.Tokens + " " + d.AuthoredTags + " " + d.ConceptLabels + " " + d.DisplayName + " ";

    /// <summary>
    /// How one asset measures against the profile the search ran for (prompt 13-D3).
    /// </summary>
    /// <remarks>
    /// Matched in memory over the page rather than in SQL: the ranking needs a score for every
    /// candidate row, but naming the tokens is only interesting for the hits actually returned.
    /// The membership test is the in-memory equivalent of the boundary ILIKE above, so the
    /// tokens reported are the same ones that moved the rank.
    /// </remarks>
    private static AssetProfileFit? FitOf(
        Domain.Models.AssetSearchDocument doc, ProfileSearchBias? profile)
    {
        if (profile is null)
        {
            return null;
        }

        var blob = StyleBlob(doc).ToLowerInvariant();
        var matched = profile.BoostTokens.Where(t => blob.Contains(" " + t + " ", StringComparison.Ordinal)).ToList();
        var contradicts = profile.PenaltyTokens.Where(t => blob.Contains(" " + t + " ", StringComparison.Ordinal)).ToList();

        return new AssetProfileFit(
            doc.TriangleCount,
            profile.TriangleCap,
            // Two different nulls collapse to one honest answer: no cap to measure against, and
            // no triangles to measure. Neither is "over budget", and neither is "within" it.
            profile.TriangleCap is int cap && doc.TriangleCount is int tris ? tris <= cap : null,
            matched,
            contradicts,
            profile.Styles.Count > 0 && doc.Styles.Any(v => profile.Styles.Contains(v, StringComparer.Ordinal)));
    }

    /// <summary>
    /// Projects a search document into a hit, carrying the structural facts inline so a
    /// caller can choose between candidates without a follow-up call per hit.
    /// </summary>
    private static AssetSearchHit ToHit(
        Domain.Models.AssetSearchDocument doc,
        string matchedOn = "browse",
        ProfileSearchBias? profile = null) =>
        new(doc.AssetType,
            doc.AssetId,
            doc.VersionId,
            doc.PartPath,
            doc.DisplayName,
            doc.BrowseSummary,
            doc.Prominence,
            matchedOn,
            FactsOf(doc, profile));

    private static AssetSearchFacts FactsOf(
        Domain.Models.AssetSearchDocument doc, ProfileSearchBias? profile = null) =>
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
            doc.UvStatus,
            doc.Styles.Count == 0 ? null : doc.Styles,
            doc.Themes.Count == 0 ? null : doc.Themes,
            doc.License,
            FitOf(doc, profile));

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

    public async Task<SearchFacetRangesResponse> GetFacetRangesAsync(
        string? assetType,
        CancellationToken cancellationToken = default)
    {
        // Asset-level, current-version, active - the exact set search_assets filters over.
        // Reading a range from a wider set would describe assets a filter cannot reach.
        var documents = _context.AssetSearchDocuments
            .AsNoTracking()
            .Where(d => d.PartPath == null && d.IsCurrentVersion && d.IsActive);

        var family = assetType?.Trim();
        if (!string.IsNullOrEmpty(family))
        {
            documents = documents.Where(d => d.AssetType == family);
        }

        var indexed = await documents.CountAsync(cancellationToken);

        var ranges = new List<SearchFacetRange>();

        foreach (var (field, selector) in NumericFacets)
        {
            if (await RangeAsync(documents, field, selector, cancellationToken) is { } range)
            {
                ranges.Add(range);
            }
        }

        var values = new Dictionary<string, IReadOnlyList<SearchFacetValue>>(StringComparer.Ordinal)
        {
            ["category"] = await ScalarValuesAsync(documents, d => d.CategoryName, cancellationToken),
            ["uvStatus"] = await ScalarValuesAsync(documents, d => d.UvStatus, cancellationToken),
            ["license"] = await ScalarValuesAsync(documents, d => d.License, cancellationToken),
            ["shapeClass"] = await ScalarValuesAsync(documents, d => d.ShapeClass, cancellationToken),
            ["styles"] = await ListValuesAsync(documents, d => d.Styles, cancellationToken),
            ["themes"] = await ListValuesAsync(documents, d => d.Themes, cancellationToken),
        };

        return new SearchFacetRangesResponse(
            string.IsNullOrEmpty(family) ? null : family,
            indexed,
            ranges,
            values,
            Array.Empty<string>());
    }

    /// <summary>The numeric filters worth describing, and how to read each one off a document.</summary>
    private static readonly (string Field, Expression<Func<AssetSearchDocument, double?>> Selector)[] NumericFacets =
    [
        ("triangles", d => (double?)d.TriangleCount),
        ("vertices", d => (double?)d.VertexCount),
        ("parts", d => (double?)d.PartCount),
        ("materials", d => (double?)d.MaterialCount),
        ("size", d => d.MaxDimension),
    ];

    /// <summary>
    /// Quartiles by ordinal position rather than a database percentile function.
    ///
    /// Four small indexed reads, and portable: <c>percentile_cont</c> is Postgres-only, and
    /// this is the one place the search layer would have needed a dialect-specific query.
    /// </summary>
    private static async Task<SearchFacetRange?> RangeAsync(
        IQueryable<AssetSearchDocument> documents,
        string field,
        Expression<Func<AssetSearchDocument, double?>> selector,
        CancellationToken cancellationToken)
    {
        var measured = documents.Select(selector).Where(v => v != null).Select(v => v!.Value);

        var count = await measured.CountAsync(cancellationToken);
        if (count == 0)
        {
            return null;
        }

        var ordered = measured.OrderBy(v => v);

        async Task<double> At(int index) =>
            await ordered.Skip(Math.Clamp(index, 0, count - 1)).FirstAsync(cancellationToken);

        return new SearchFacetRange(
            field,
            count,
            await At(0),
            await At(count / 4),
            await At(count / 2),
            await At(count * 3 / 4),
            await ordered.LastOrDefaultAsync(cancellationToken));
    }

    private static async Task<IReadOnlyList<SearchFacetValue>> ScalarValuesAsync(
        IQueryable<AssetSearchDocument> documents,
        Expression<Func<AssetSearchDocument, string?>> selector,
        CancellationToken cancellationToken)
    {
        var counts = await documents
            .Select(selector)
            .Where(v => v != null && v != "")
            .GroupBy(v => v!)
            .Select(g => new { Value = g.Key, Count = g.Count() })
            .OrderByDescending(g => g.Count)
            .Take(MaxFacetValues)
            .ToListAsync(cancellationToken);

        return counts.Select(c => new SearchFacetValue(c.Value, c.Count)).ToList();
    }

    /// <summary>
    /// Counts over a list-valued column. Materialised and grouped in memory on purpose: the
    /// column is a jsonb array, and the set of distinct styles in a library is tiny next to
    /// the set of assets - so this reads one small column, not a table.
    /// </summary>
    private static async Task<IReadOnlyList<SearchFacetValue>> ListValuesAsync(
        IQueryable<AssetSearchDocument> documents,
        Expression<Func<AssetSearchDocument, List<string>>> selector,
        CancellationToken cancellationToken)
    {
        var lists = await documents.Select(selector).ToListAsync(cancellationToken);

        return lists
            .SelectMany(list => list ?? [])
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .GroupBy(value => value, StringComparer.OrdinalIgnoreCase)
            .Select(g => new SearchFacetValue(g.First(), g.Count()))
            .OrderByDescending(v => v.Count)
            .Take(MaxFacetValues)
            .ToList();
    }

    /// <summary>Cap on values reported per categorical facet. Enough to choose from, not a dump.</summary>
    private const int MaxFacetValues = 40;

}
