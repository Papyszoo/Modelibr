namespace Application.Search;

/// <summary>
/// Deterministic, local-first keyword → semantic-label mapping (prompt 29, Part C).
/// The retrieval test showed lexical search is semantically blind: a query like
/// <c>weapon</c> or <c>animal</c> returns nothing because no authored token contains
/// that word. This maps the concrete tokens an asset carries (<c>sword</c>, <c>wolf</c>,
/// <c>house</c>) to the concept words a human searches by (<c>weapon</c>, <c>animal</c>,
/// <c>building</c>).
///
/// Used two ways: the labels are folded into the asset's indexed search tokens so
/// free-text conceptual queries hit (improved <b>recall</b>), and they are surfaced as
/// <c>suggestedCategories</c> so a user/agent can confirm-assign a real category — the
/// suggestion never auto-mutates the user's category assignment (product decision:
/// suggest, don't auto-apply). No hosted inference — a static, auditable map only; a
/// local embedding model is the heavier future alternative.
/// </summary>
public static class CategorySuggester
{
    // label -> trigger keywords. A token matches a keyword when it equals it or
    // contains it as a substring (so "longsword" → sword → weapon). Keep keywords
    // >= 3 chars to avoid spurious substring hits.
    private static readonly IReadOnlyDictionary<string, string[]> Map =
        new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase)
        {
            ["weapon"] = new[]
            {
                "weapon", "sword", "blade", "katana", "dagger", "knife", "axe", "mace",
                "spear", "bow", "arrow", "crossbow", "gun", "rifle", "pistol", "revolver",
                "shotgun", "cannon", "grenade", "bomb", "shield", "ammo", "bullet", "hammer",
            },
            ["animal"] = new[]
            {
                "animal", "creature", "beast", "dog", "cat", "wolf", "bear", "horse", "cow",
                "sheep", "pig", "deer", "rabbit", "fox", "lion", "tiger", "bird", "eagle",
                "fish", "shark", "snake", "spider", "dragon", "monster", "zombie", "rat",
            },
            ["building"] = new[]
            {
                "building", "house", "hut", "cabin", "tower", "castle", "fort", "temple",
                "church", "wall", "roof", "door", "window", "bridge", "structure", "ruin",
                "shed", "barn", "warehouse", "shop", "tavern", "stairs", "pillar", "column",
            },
            ["vehicle"] = new[]
            {
                "vehicle", "car", "truck", "van", "bus", "tank", "plane", "aircraft", "jet",
                "helicopter", "ship", "boat", "submarine", "train", "wagon", "cart", "wheel",
                "motorcycle", "bike", "rocket", "spaceship",
            },
            ["character"] = new[]
            {
                "character", "human", "person", "man", "woman", "soldier", "knight", "warrior",
                "mage", "wizard", "robot", "android", "npc", "avatar", "figure", "skeleton",
            },
            ["furniture"] = new[]
            {
                "furniture", "chair", "table", "desk", "sofa", "couch", "bed", "shelf",
                "cabinet", "drawer", "stool", "bench", "wardrobe", "bookshelf", "lamp",
            },
            ["nature"] = new[]
            {
                "tree", "plant", "bush", "shrub", "grass", "flower", "rock", "stone", "boulder",
                "cliff", "mountain", "terrain", "foliage", "leaf", "log", "root", "mushroom",
            },
            ["food"] = new[]
            {
                "food", "fruit", "apple", "banana", "bread", "meat", "cheese", "vegetable",
                "bottle", "drink", "cake", "egg", "fish",
            },
            ["prop"] = new[]
            {
                "crate", "barrel", "box", "chest", "container", "sign", "fence", "pot", "vase",
                "lantern", "torch", "sack", "bucket", "ladder", "key", "coin", "book", "scroll",
            },
            ["environment"] = new[]
            {
                "floor", "ground", "road", "path", "tile", "platform", "fence", "gate",
                "streetlight", "lamppost",
            },
        };

    /// <summary>
    /// Suggest concept labels for an asset from its tokens. Deterministic and
    /// order-stable (labels returned alphabetically). Empty when nothing matches.
    /// </summary>
    public static IReadOnlyList<string> Suggest(IEnumerable<string>? tokens)
    {
        if (tokens is null) return Array.Empty<string>();

        var normalized = tokens
            .Where(t => !string.IsNullOrWhiteSpace(t))
            .Select(t => t.Trim().ToLowerInvariant())
            .ToList();
        if (normalized.Count == 0) return Array.Empty<string>();

        var labels = new SortedSet<string>(StringComparer.Ordinal);
        foreach (var (label, keywords) in Map)
        {
            if (normalized.Any(token => keywords.Any(k => TokenMatches(token, k))))
            {
                labels.Add(label);
            }
        }
        return labels.ToList();
    }

    private static bool TokenMatches(string token, string keyword) =>
        token.Length >= keyword.Length && token.Contains(keyword, StringComparison.Ordinal);
}
