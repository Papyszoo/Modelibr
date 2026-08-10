namespace Application.Search;

/// <summary>
/// Deterministic, local-first keyword → semantic-label mapping. Maps the concrete tokens
/// an asset carries (<c>sword</c>, <c>wolf</c>, <c>apartment</c>) to the concept words a
/// human or agent searches by (<c>weapon</c>, <c>animal</c>, <c>building</c>).
///
/// Used two ways: labels are folded into the asset's indexed tokens so conceptual queries
/// hit (recall), and they are surfaced as <c>suggestedCategories</c> so a user/agent can
/// confirm-assign a real category — a suggestion never auto-mutates the user's assignment.
/// No hosted inference: a static, auditable map only.
///
/// <b>Matching is exact, per token.</b> It used to be a substring test, which quietly
/// produced nonsense on a real library: <c>credit_card</c> was a <i>vehicle</i> because
/// "card" contains "car", <c>roman_pottery</c> was a <i>character</i> because "roman"
/// contains "man", <c>bowl</c> was a <i>weapon</i> because it contains "bow", and
/// <c>clamp</c> was <i>furniture</i> because it contains "lamp". Compound words are handled
/// by <see cref="SearchVocabulary"/> joining adjacent tokens before this runs, so
/// <c>lamp_post</c> still resolves — without letting "lamp" swallow "clamp".
/// </summary>
public static class CategorySuggester
{
    // label -> trigger keywords, matched by EXACT token equality. Keep concept lists to
    // the thing itself, not its parts: someone asking for a "building" wants buildings,
    // not the 200 doors and windows that belong to them.
    private static readonly IReadOnlyDictionary<string, string[]> Map =
        new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase)
        {
            ["weapon"] = new[]
            {
                "weapon", "sword", "longsword", "broadsword", "greatsword", "blade", "katana",
                "dagger", "knife", "axe", "hatchet", "mace", "spear", "halberd", "bow",
                "crossbow", "arrow", "quiver", "gun", "rifle", "pistol", "revolver", "shotgun",
                "smg", "cannon", "grenade", "bomb", "shield", "ammo", "bullet", "warhammer",
                "sledgehammer", "club", "flail", "scythe", "machete",
            },
            ["animal"] = new[]
            {
                "animal", "creature", "beast", "dog", "cat", "wolf", "bear", "horse", "cow",
                "sheep", "pig", "deer", "rabbit", "fox", "lion", "tiger", "bird", "eagle",
                "fish", "shark", "snake", "spider", "dragon", "monster", "zombie", "rat",
                "mouse", "frog", "chicken", "duck", "goat", "insect", "bug",
            },
            ["building"] = new[]
            {
                "building", "house", "home", "hut", "cabin", "cottage", "tower", "skyscraper",
                "castle", "fort", "fortress", "temple", "church", "cathedral", "mosque",
                "bridge", "structure", "ruin", "shed", "barn", "warehouse", "shop", "store",
                "apartment", "flat", "tenement", "office", "factory", "station", "garage",
                "hotel", "motel", "restaurant", "diner", "cafe", "bank", "school", "hospital",
                "mall", "tavern", "inn", "silo", "hangar", "bunker", "lighthouse",
            },
            ["vehicle"] = new[]
            {
                "vehicle", "car", "automobile", "truck", "lorry", "van", "bus", "tank",
                "plane", "airplane", "aircraft", "jet", "helicopter", "ship", "boat", "yacht",
                "submarine", "train", "tram", "wagon", "cart", "motorcycle", "motorbike",
                "scooter", "bicycle", "bike", "rocket", "spaceship", "ambulance", "taxi",
                // Deliberately NOT "police": a police officer is a character, and the
                // police car already matches on "car".
                "tractor", "forklift", "bulldozer", "excavator", "sedan", "suv",
            },
            ["character"] = new[]
            {
                "character", "human", "person", "people", "man", "woman", "boy", "girl",
                "soldier", "knight", "warrior", "mage", "wizard", "robot", "android", "npc",
                "avatar", "figure", "skeleton", "pedestrian", "civilian", "worker",
                "businessman", "businesswoman", "policeman", "policewoman", "zombie",
            },
            ["furniture"] = new[]
            {
                "furniture", "chair", "armchair", "table", "desk", "sofa", "couch", "settee",
                "bed", "bunk", "shelf", "bookshelf", "bookcase", "cabinet", "cupboard",
                "drawer", "dresser", "stool", "bench", "wardrobe", "nightstand", "sideboard",
                "ottoman", "recliner",
            },
            ["nature"] = new[]
            {
                "tree", "pine", "oak", "birch", "palm", "plant", "bush", "shrub", "grass",
                "flower", "rock", "stone", "boulder", "cliff", "mountain", "terrain",
                "foliage", "leaf", "leaves", "log", "root", "mushroom", "hedge", "vine",
                "vegetation", "cactus", "fern",
            },
            ["food"] = new[]
            {
                "food", "fruit", "apple", "banana", "orange", "pear", "grape", "bread",
                "meat", "steak", "cheese", "vegetable", "carrot", "potato", "tomato",
                "drink", "cake", "pie", "egg", "sandwich", "burger", "pizza", "donut",
                "cookie", "candy",
            },
            ["prop"] = new[]
            {
                "crate", "barrel", "box", "chest", "container", "sign", "signage", "fence",
                "pot", "vase", "lantern", "torch", "sack", "bucket", "ladder", "key", "coin",
                "book", "scroll", "bottle", "can", "jar", "basket", "pallet", "trolley",
                "bin", "dumpster", "trashcan", "hydrant", "bollard", "cone",
            },
            ["environment"] = new[]
            {
                "floor", "ground", "road", "street", "path", "pavement", "sidewalk", "tile",
                "platform", "gate", "streetlight", "lamppost", "streetlamp", "kerb", "curb",
                "wall", "roof", "door", "window", "stairs", "staircase", "pillar", "column",
                "fence", "railing", "manhole", "drain", "trafficlight", "streetsign",
                "roadsign", "crosswalk", "guardrail", "streetdivider",
            },
        };

    /// <summary>
    /// Suggest concept labels for an asset from its tokens. Deterministic and order-stable
    /// (labels returned alphabetically). Empty when nothing matches.
    /// </summary>
    /// <remarks>
    /// Pass tokens already widened by <see cref="SearchVocabulary.ExpandForIndex"/> to get
    /// abbreviation and compound coverage; raw tokens still work, just with less recall.
    /// </remarks>
    public static IReadOnlyList<string> Suggest(IEnumerable<string>? tokens)
    {
        if (tokens is null) return Array.Empty<string>();

        var normalized = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var token in tokens)
        {
            if (string.IsNullOrWhiteSpace(token)) continue;
            var trimmed = token.Trim().ToLowerInvariant();
            normalized.Add(trimmed);
            // A plural authored name ("barrels") should still resolve to its concept.
            normalized.Add(SearchVocabulary.Singularize(trimmed));
        }
        if (normalized.Count == 0) return Array.Empty<string>();

        var labels = new SortedSet<string>(StringComparer.Ordinal);
        foreach (var (label, keywords) in Map)
        {
            if (keywords.Any(normalized.Contains))
            {
                labels.Add(label);
            }
        }
        return labels.ToList();
    }
}
