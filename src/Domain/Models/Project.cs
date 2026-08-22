using Domain.Projects;
using Domain.ValueObjects;

namespace Domain.Models;

/// <summary>
/// Represents a project/folder that groups models, texture sets, sprites, and sounds together.
/// Provides organization and categorization for 3D assets.
/// </summary>
public class Project : AggregateRoot
{
    private readonly List<Model> _models = new();
    private readonly List<TextureSet> _textureSets = new();
    private readonly List<Sprite> _sprites = new();
    private readonly List<Sound> _sounds = new();
    private readonly List<Script> _scripts = new();
    private readonly List<EnvironmentMap> _environmentMaps = new();
    private readonly List<ProjectConceptImage> _conceptImages = new();
    private readonly List<ProjectProfileValue> _profileValues = new();
    private readonly List<Scene> _scenes = new();

    public int Id { get; private set; }
    public string Name { get; private set; } = string.Empty;
    public string? Description { get; private set; }
    public string? Notes { get; private set; }
    public int? CustomThumbnailFileId { get; private set; }
    public DateTime CreatedAt { get; private set; }
    public DateTime UpdatedAt { get; private set; }

    // ---- the fidelity budget (prompt 13-A) ----
    // Every one of these is nullable, and NULL means UNCONSTRAINED. It must never be read as
    // a default: an agent silently held to a budget nobody set is worse than one held to
    // none. A default may be *offered* from the platform selection, but what is stored is
    // the number the user accepted - a number the agent reads has to be a number the user saw.

    /// <summary>Per-asset triangle cap. The one profile field today's search can act on numerically.</summary>
    public int? MaxTrianglesPerAsset { get; private set; }

    public int? MaxTextureSize { get; private set; }

    public int? TargetSceneTriangles { get; private set; }

    /// <summary>
    /// Pixels per world unit, for 2D projects. Stated in the brief and usable while
    /// authoring, but <b>not filterable</b>: nothing extracts a sprite's pixel dimensions
    /// yet, so a check on it would be a check that never runs.
    /// </summary>
    public int? PixelsPerUnit { get; private set; }

    // ---- the world convention (prompt 13-A) ----
    // One AUTHORED convention, defaulted to Modelibr's own. It cannot be looked up from the
    // engine, because a project has several engines and they disagree - Blender is 1 unit /
    // Z-up / right-handed, Unity 1 / Y / left, Unreal 100 / Z / left. Picking one silently
    // is how an asset comes back on its side. The per-engine conversions are REPORTED in the
    // brief, never resolved here.

    public double? UnitsPerMetre { get; private set; }

    /// <summary><c>X</c>, <c>Y</c> or <c>Z</c>. Null means Modelibr's own (Y-up).</summary>
    public string? UpAxis { get; private set; }

    /// <summary><c>right</c> or <c>left</c>. Null means Modelibr's own (right-handed).</summary>
    public string? Handedness { get; private set; }

    /// <summary>
    /// The project's chosen palette, 3-6 hex colours. Cheap signal, and the one part of
    /// "reference material" an agent can act on without looking at an image.
    /// </summary>
    public List<string> PaletteHex { get; private set; } = new();

    public File? CustomThumbnailFile { get; private set; }

    /// <summary>The project's profile assignments across every dimension.</summary>
    public ICollection<ProjectProfileValue> ProfileValues
    {
        get => _profileValues;
        set
        {
            _profileValues.Clear();
            if (value != null)
                _profileValues.AddRange(value);
        }
    }

    /// <summary>
    /// Scenes built for this project. The link lives on <see cref="Scene"/> and is nullable:
    /// deleting a project must not delete its scenes.
    /// </summary>
    public ICollection<Scene> Scenes
    {
        get => _scenes;
        set
        {
            _scenes.Clear();
            if (value != null)
                _scenes.AddRange(value);
        }
    }

    // Navigation property for many-to-many relationship with Models - EF Core requires this to be settable
    public ICollection<Model> Models
    {
        get => _models;
        set
        {
            _models.Clear();
            if (value != null)
                _models.AddRange(value);
        }
    }

    // Navigation property for many-to-many relationship with TextureSets - EF Core requires this to be settable
    public ICollection<TextureSet> TextureSets
    {
        get => _textureSets;
        set
        {
            _textureSets.Clear();
            if (value != null)
                _textureSets.AddRange(value);
        }
    }

    // Navigation property for many-to-many relationship with Sprites - EF Core requires this to be settable
    public ICollection<Sprite> Sprites
    {
        get => _sprites;
        set
        {
            _sprites.Clear();
            if (value != null)
                _sprites.AddRange(value);
        }
    }

    // Navigation property for many-to-many relationship with Sounds - EF Core requires this to be settable
    public ICollection<Sound> Sounds
    {
        get => _sounds;
        set
        {
            _sounds.Clear();
            if (value != null)
                _sounds.AddRange(value);
        }
    }

    // Navigation property for many-to-many relationship with Scripts - EF Core requires this to be settable
    public ICollection<Script> Scripts
    {
        get => _scripts;
        set
        {
            _scripts.Clear();
            if (value != null)
                _scripts.AddRange(value);
        }
    }

    public ICollection<EnvironmentMap> EnvironmentMaps
    {
        get => _environmentMaps;
        set
        {
            _environmentMaps.Clear();
            if (value != null)
                _environmentMaps.AddRange(value);
        }
    }

    public ICollection<ProjectConceptImage> ConceptImages
    {
        get => _conceptImages;
        set
        {
            _conceptImages.Clear();
            if (value != null)
                _conceptImages.AddRange(value);
        }
    }

    /// <summary>
    /// Creates a new Project with the specified name and optional description.
    /// </summary>
    /// <param name="name">The name of the project</param>
    /// <param name="description">Optional description of the project</param>
    /// <param name="createdAt">When the project was created</param>
    /// <returns>A new Project instance</returns>
    /// <exception cref="ArgumentException">Thrown when name validation fails</exception>
    public static Project Create(string name, string? description, DateTime createdAt)
    {
        return Create(name, description, null, createdAt);
    }

    public static Project Create(string name, string? description, string? notes, DateTime createdAt)
    {
        ValidateName(name);
        ValidateNotes(notes);

        if (description != null && description.Length > 1000)
            throw new ArgumentException("Project description cannot exceed 1000 characters.", nameof(description));

        return new Project
        {
            Name = name.Trim(),
            Description = description?.Trim(),
            Notes = notes?.Trim(),
            CreatedAt = createdAt,
            UpdatedAt = createdAt
        };
    }

    /// <summary>
    /// Updates the name and description of the project.
    /// </summary>
    /// <param name="name">The new name</param>
    /// <param name="description">The new description</param>
    /// <param name="updatedAt">When the update occurred</param>
    /// <exception cref="ArgumentException">Thrown when name validation fails</exception>
    public void Update(string name, string? description, DateTime updatedAt)
    {
        Update(name, description, null, updatedAt);
    }

    public void Update(string name, string? description, string? notes, DateTime updatedAt)
    {
        ValidateName(name);
        ValidateNotes(notes);

        if (description != null && description.Length > 1000)
            throw new ArgumentException("Project description cannot exceed 1000 characters.", nameof(description));

        Name = name.Trim();
        Description = description?.Trim();
        Notes = notes?.Trim();
        UpdatedAt = updatedAt;
    }

    /// <summary>
    /// Replaces the profile assignments for <b>one dimension</b>, leaving the others alone.
    /// Per-dimension rather than wholesale because the UI edits one row at a time, and a
    /// wholesale write would make "I only touched Style" indistinguishable from "I cleared
    /// Genre".
    /// </summary>
    /// <param name="assignments">Option ids with their optional roles, all from this dimension.</param>
    public void SetProfileDimension(
        string dimension,
        IReadOnlyDictionary<int, string?> assignments,
        IReadOnlyDictionary<int, string> optionDimensions,
        DateTime updatedAt)
    {
        var normalized = ProjectProfileDimensions.Normalize(dimension)
            ?? throw new ArgumentException($"'{dimension}' is not a project profile dimension.", nameof(dimension));

        foreach (var (optionId, _) in assignments)
        {
            if (!optionDimensions.TryGetValue(optionId, out var optionDimension))
            {
                throw new ArgumentException($"Profile option {optionId} does not exist.", nameof(assignments));
            }

            if (!string.Equals(optionDimension, normalized, StringComparison.OrdinalIgnoreCase))
            {
                // Cross-dimension assignment is the mistake this guard exists for: one
                // vocabulary table means "Low Poly" and "Meta Quest" are rows in the same
                // place, and nothing in the schema stops a platform being assigned as a style.
                throw new ArgumentException(
                    $"Profile option {optionId} belongs to '{optionDimension}', not '{normalized}'.",
                    nameof(assignments));
            }
        }

        _profileValues.RemoveAll(v =>
            optionDimensions.TryGetValue(v.OptionId, out var d)
            && string.Equals(d, normalized, StringComparison.OrdinalIgnoreCase));

        var supportsRole = ProjectProfileDimensions.SupportsRole(normalized);
        foreach (var (optionId, role) in assignments)
        {
            _profileValues.Add(ProjectProfileValue.Create(Id, optionId, supportsRole ? role : null));
        }

        UpdatedAt = updatedAt;
    }

    /// <summary>
    /// Sets the fidelity budget and the world convention. Every argument is nullable and a
    /// null clears the field - these are written as one group from one form, so "leave it
    /// alone" is not a state this method needs to express.
    /// </summary>
    public void SetProfileSettings(
        int? maxTrianglesPerAsset,
        int? maxTextureSize,
        int? targetSceneTriangles,
        int? pixelsPerUnit,
        double? unitsPerMetre,
        string? upAxis,
        string? handedness,
        IEnumerable<string>? paletteHex,
        DateTime updatedAt)
    {
        if (maxTrianglesPerAsset is <= 0)
            throw new ArgumentException("A triangle budget must be greater than 0.", nameof(maxTrianglesPerAsset));
        if (maxTextureSize is <= 0)
            throw new ArgumentException("A texture size must be greater than 0.", nameof(maxTextureSize));
        if (targetSceneTriangles is <= 0)
            throw new ArgumentException("A scene triangle target must be greater than 0.", nameof(targetSceneTriangles));
        if (pixelsPerUnit is <= 0)
            throw new ArgumentException("Pixels per unit must be greater than 0.", nameof(pixelsPerUnit));
        if (unitsPerMetre is <= 0)
            throw new ArgumentException("Units per metre must be greater than 0.", nameof(unitsPerMetre));

        var axis = NormalizeAxis(upAxis);
        var hand = NormalizeHandedness(handedness);

        MaxTrianglesPerAsset = maxTrianglesPerAsset;
        MaxTextureSize = maxTextureSize;
        TargetSceneTriangles = targetSceneTriangles;
        PixelsPerUnit = pixelsPerUnit;
        UnitsPerMetre = unitsPerMetre;
        UpAxis = axis;
        Handedness = hand;
        PaletteHex = NormalizePalette(paletteHex);
        UpdatedAt = updatedAt;
    }

    private static string? NormalizeAxis(string? axis)
    {
        if (string.IsNullOrWhiteSpace(axis)) return null;
        var trimmed = axis.Trim().ToUpperInvariant();
        return trimmed is "X" or "Y" or "Z"
            ? trimmed
            : throw new ArgumentException("Up axis must be X, Y or Z.", nameof(axis));
    }

    private static string? NormalizeHandedness(string? handedness)
    {
        if (string.IsNullOrWhiteSpace(handedness)) return null;
        var trimmed = handedness.Trim().ToLowerInvariant();
        return trimmed is "right" or "left"
            ? trimmed
            : throw new ArgumentException("Handedness must be right or left.", nameof(handedness));
    }

    /// <summary>
    /// Accepts <c>#rrggbb</c> (and the three-digit short form), upper-cased with the hash,
    /// capped at six. A palette is a signal, not a swatch library; past six it stops saying
    /// anything about the project's identity.
    /// </summary>
    private static List<string> NormalizePalette(IEnumerable<string>? palette)
    {
        if (palette is null) return new List<string>();

        var result = new List<string>();
        foreach (var raw in palette)
        {
            if (string.IsNullOrWhiteSpace(raw)) continue;

            var value = raw.Trim().TrimStart('#').ToUpperInvariant();
            if (value.Length is not (3 or 6) || !value.All(Uri.IsHexDigit))
            {
                throw new ArgumentException($"'{raw}' is not a hex colour.", nameof(palette));
            }

            var normalized = "#" + value;
            if (!result.Contains(normalized))
            {
                result.Add(normalized);
            }

            if (result.Count == 6) break;
        }

        return result;
    }

    public void SetCustomThumbnail(File? file, DateTime updatedAt)
    {
        CustomThumbnailFileId = file?.Id;
        CustomThumbnailFile = file;
        UpdatedAt = updatedAt;
    }

    public void AddConceptImage(File file, DateTime createdAt)
    {
        ArgumentNullException.ThrowIfNull(file);

        if (_conceptImages.Any(ci => ci.FileId == file.Id))
            return;

        var nextSortOrder = _conceptImages.Count == 0 ? 0 : _conceptImages.Max(ci => ci.SortOrder) + 1;
        _conceptImages.Add(ProjectConceptImage.Create(Id, file.Id, nextSortOrder, createdAt));
        UpdatedAt = createdAt;
    }

    public void RemoveConceptImage(int fileId, DateTime updatedAt)
    {
        var conceptImage = _conceptImages.FirstOrDefault(ci => ci.FileId == fileId);
        if (conceptImage == null)
            return;

        _conceptImages.Remove(conceptImage);
        UpdatedAt = updatedAt;
    }

    public IReadOnlyList<ProjectConceptImage> GetConceptImages()
    {
        return _conceptImages.OrderBy(ci => ci.SortOrder).ToList().AsReadOnly();
    }

    /// <summary>
    /// Adds a model to this project.
    /// </summary>
    /// <param name="model">The model to add</param>
    /// <param name="updatedAt">When the association was made</param>
    /// <exception cref="ArgumentNullException">Thrown when model is null</exception>
    public void AddModel(Model model, DateTime updatedAt)
    {
        if (model == null)
            throw new ArgumentNullException(nameof(model));

        if (_models.Any(m => m.Id == model.Id))
            return; // Model already in project

        _models.Add(model);
        UpdatedAt = updatedAt;
    }

    /// <summary>
    /// Removes a model from this project.
    /// </summary>
    /// <param name="model">The model to remove</param>
    /// <param name="updatedAt">When the association was removed</param>
    /// <exception cref="ArgumentNullException">Thrown when model is null</exception>
    public void RemoveModel(Model model, DateTime updatedAt)
    {
        if (model == null)
            throw new ArgumentNullException(nameof(model));

        if (_models.Remove(model))
        {
            UpdatedAt = updatedAt;
        }
    }

    /// <summary>
    /// Checks if this project contains a model with the specified ID.
    /// </summary>
    /// <param name="modelId">The model ID to check</param>
    /// <returns>True if the model is in this project</returns>
    public bool HasModel(int modelId)
    {
        return _models.Any(m => m.Id == modelId);
    }

    /// <summary>
    /// Gets all models in this project.
    /// </summary>
    /// <returns>Read-only list of models</returns>
    public IReadOnlyList<Model> GetModels()
    {
        return _models.AsReadOnly();
    }

    /// <summary>
    /// Adds a texture set to this project.
    /// </summary>
    /// <param name="textureSet">The texture set to add</param>
    /// <param name="updatedAt">When the association was made</param>
    /// <exception cref="ArgumentNullException">Thrown when textureSet is null</exception>
    public void AddTextureSet(TextureSet textureSet, DateTime updatedAt)
    {
        if (textureSet == null)
            throw new ArgumentNullException(nameof(textureSet));

        if (_textureSets.Any(ts => ts.Id == textureSet.Id))
            return; // Texture set already in project

        _textureSets.Add(textureSet);
        UpdatedAt = updatedAt;
    }

    /// <summary>
    /// Removes a texture set from this project.
    /// </summary>
    /// <param name="textureSet">The texture set to remove</param>
    /// <param name="updatedAt">When the association was removed</param>
    /// <exception cref="ArgumentNullException">Thrown when textureSet is null</exception>
    public void RemoveTextureSet(TextureSet textureSet, DateTime updatedAt)
    {
        if (textureSet == null)
            throw new ArgumentNullException(nameof(textureSet));

        if (_textureSets.Remove(textureSet))
        {
            UpdatedAt = updatedAt;
        }
    }

    /// <summary>
    /// Checks if this project contains a texture set with the specified ID.
    /// </summary>
    /// <param name="textureSetId">The texture set ID to check</param>
    /// <returns>True if the texture set is in this project</returns>
    public bool HasTextureSet(int textureSetId)
    {
        return _textureSets.Any(ts => ts.Id == textureSetId);
    }

    /// <summary>
    /// Gets all texture sets in this project.
    /// </summary>
    /// <returns>Read-only list of texture sets</returns>
    public IReadOnlyList<TextureSet> GetTextureSets()
    {
        return _textureSets.AsReadOnly();
    }

    /// <summary>
    /// Adds a sprite to this project.
    /// </summary>
    /// <param name="sprite">The sprite to add</param>
    /// <param name="updatedAt">When the association was made</param>
    /// <exception cref="ArgumentNullException">Thrown when sprite is null</exception>
    public void AddSprite(Sprite sprite, DateTime updatedAt)
    {
        if (sprite == null)
            throw new ArgumentNullException(nameof(sprite));

        if (_sprites.Any(s => s.Id == sprite.Id))
            return; // Sprite already in project

        _sprites.Add(sprite);
        UpdatedAt = updatedAt;
    }

    /// <summary>
    /// Removes a sprite from this project.
    /// </summary>
    /// <param name="sprite">The sprite to remove</param>
    /// <param name="updatedAt">When the association was removed</param>
    /// <exception cref="ArgumentNullException">Thrown when sprite is null</exception>
    public void RemoveSprite(Sprite sprite, DateTime updatedAt)
    {
        if (sprite == null)
            throw new ArgumentNullException(nameof(sprite));

        if (_sprites.Remove(sprite))
        {
            UpdatedAt = updatedAt;
        }
    }

    /// <summary>
    /// Checks if this project contains a sprite with the specified ID.
    /// </summary>
    /// <param name="spriteId">The sprite ID to check</param>
    /// <returns>True if the sprite is in this project</returns>
    public bool HasSprite(int spriteId)
    {
        return _sprites.Any(s => s.Id == spriteId);
    }

    /// <summary>
    /// Gets all sprites in this project.
    /// </summary>
    /// <returns>Read-only list of sprites</returns>
    public IReadOnlyList<Sprite> GetSprites()
    {
        return _sprites.AsReadOnly();
    }

    /// <summary>
    /// Adds a sound to this project.
    /// </summary>
    /// <param name="sound">The sound to add</param>
    /// <param name="updatedAt">When the association was made</param>
    /// <exception cref="ArgumentNullException">Thrown when sound is null</exception>
    public void AddSound(Sound sound, DateTime updatedAt)
    {
        if (sound == null)
            throw new ArgumentNullException(nameof(sound));

        if (_sounds.Any(s => s.Id == sound.Id))
            return; // Sound already in project

        _sounds.Add(sound);
        UpdatedAt = updatedAt;
    }

    /// <summary>
    /// Removes a sound from this project.
    /// </summary>
    /// <param name="sound">The sound to remove</param>
    /// <param name="updatedAt">When the association was removed</param>
    /// <exception cref="ArgumentNullException">Thrown when sound is null</exception>
    public void RemoveSound(Sound sound, DateTime updatedAt)
    {
        if (sound == null)
            throw new ArgumentNullException(nameof(sound));

        if (_sounds.Remove(sound))
        {
            UpdatedAt = updatedAt;
        }
    }

    /// <summary>
    /// Checks if this project contains a sound with the specified ID.
    /// </summary>
    /// <param name="soundId">The sound ID to check</param>
    /// <returns>True if the sound is in this project</returns>
    public bool HasSound(int soundId)
    {
        return _sounds.Any(s => s.Id == soundId);
    }

    /// <summary>
    /// Gets all sounds in this project.
    /// </summary>
    /// <returns>Read-only list of sounds</returns>
    public IReadOnlyList<Sound> GetSounds()
    {
        return _sounds.AsReadOnly();
    }

    /// <summary>Adds a script to this project.</summary>
    public void AddScript(Script script, DateTime updatedAt)
    {
        if (script == null)
            throw new ArgumentNullException(nameof(script));

        if (_scripts.Any(s => s.Id == script.Id))
            return; // Script already in project

        _scripts.Add(script);
        UpdatedAt = updatedAt;
    }

    /// <summary>Removes a script from this project.</summary>
    public void RemoveScript(Script script, DateTime updatedAt)
    {
        if (script == null)
            throw new ArgumentNullException(nameof(script));

        if (_scripts.Remove(script))
        {
            UpdatedAt = updatedAt;
        }
    }

    /// <summary>Checks if this project contains a script with the specified ID.</summary>
    public bool HasScript(int scriptId)
    {
        return _scripts.Any(s => s.Id == scriptId);
    }

    /// <summary>Gets all scripts in this project.</summary>
    public IReadOnlyList<Script> GetScripts()
    {
        return _scripts.AsReadOnly();
    }

    public void AddEnvironmentMap(EnvironmentMap environmentMap, DateTime updatedAt)
    {
        if (environmentMap == null)
            throw new ArgumentNullException(nameof(environmentMap));

        if (_environmentMaps.Any(em => em.Id == environmentMap.Id))
            return;

        _environmentMaps.Add(environmentMap);
        UpdatedAt = updatedAt;
    }

    public void RemoveEnvironmentMap(EnvironmentMap environmentMap, DateTime updatedAt)
    {
        if (environmentMap == null)
            throw new ArgumentNullException(nameof(environmentMap));

        if (_environmentMaps.Remove(environmentMap))
            UpdatedAt = updatedAt;
    }

    public bool HasEnvironmentMap(int environmentMapId)
    {
        return _environmentMaps.Any(em => em.Id == environmentMapId);
    }

    public IReadOnlyList<EnvironmentMap> GetEnvironmentMaps()
    {
        return _environmentMaps.AsReadOnly();
    }

    /// <summary>
    /// Gets the count of models in this project.
    /// </summary>
    public int ModelCount => _models.Count;

    /// <summary>
    /// Gets the count of universal (Global Materials) texture sets in this project.
    /// </summary>
    public int GlobalMaterialCount => _textureSets.Count(ts => ts.Kind == TextureSetKind.Universal);

    /// <summary>
    /// Gets the count of model-specific (Multi-Model) texture sets in this project.
    /// </summary>
    public int MultiModelTextureCount => _textureSets.Count(ts => ts.Kind == TextureSetKind.ModelSpecific);

    /// <summary>
    /// Gets the count of sprites in this project.
    /// </summary>
    public int SpriteCount => _sprites.Count;

    /// <summary>
    /// Gets the count of sounds in this project.
    /// </summary>
    public int SoundCount => _sounds.Count;

    /// <summary>
    /// Gets the count of scripts in this project.
    /// </summary>
    public int ScriptCount => _scripts.Count;

    public int EnvironmentMapCount => _environmentMaps.Count;

    /// <summary>
    /// Checks if the project is empty (contains no models, texture sets, sprites, or sounds).
    /// </summary>
    public bool IsEmpty => _models.Count == 0 && _textureSets.Count == 0 && _sprites.Count == 0 && _sounds.Count == 0 && _environmentMaps.Count == 0;

    /// <summary>
    /// Gets a human-readable description of the project.
    /// </summary>
    /// <returns>Description including name and content counts</returns>
    public string GetSummary()
    {
        return $"{Name} ({_models.Count} models, {_textureSets.Count} texture sets, {_sprites.Count} sprites, {_sounds.Count} sounds, {_environmentMaps.Count} environment maps)";
    }

    private static void ValidateName(string name)
    {
        if (string.IsNullOrWhiteSpace(name))
            throw new ArgumentException("Project name cannot be null or empty.", nameof(name));

        if (name.Length > 200)
            throw new ArgumentException("Project name cannot exceed 200 characters.", nameof(name));
    }

    private static void ValidateNotes(string? notes)
    {
        if (notes != null && notes.Length > 4000)
            throw new ArgumentException("Project notes cannot exceed 4000 characters.", nameof(notes));
    }
}
