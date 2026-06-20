namespace Domain.Models;

/// <summary>
/// Represents a sound asset with waveform visualization data.
/// Sounds can be associated with projects, packs, and optionally categorized.
/// </summary>
public class Sound : AggregateRoot
{
    private readonly List<Pack> _packs = new();
    private readonly List<Project> _projects = new();

    public int Id { get; private set; }
    public string Name { get; private set; } = string.Empty;
    public int FileId { get; private set; }
    public int? SoundCategoryId { get; private set; }
    public double Duration { get; private set; }
    public string? Peaks { get; private set; }

    /// <summary>
    /// Audio sample rate in Hz (e.g. 44100), extracted by the worker. Null until processed.
    /// </summary>
    public int? SampleRate { get; private set; }

    /// <summary>
    /// Number of audio channels (1 = mono, 2 = stereo), extracted by the worker. Null until processed.
    /// </summary>
    public int? Channels { get; private set; }

    /// <summary>
    /// Audio container/codec format (e.g. "wav", "mp3", "ogg"), extracted by the worker. Null until processed.
    /// </summary>
    public string? Format { get; private set; }

    public DateTime CreatedAt { get; private set; }
    public DateTime UpdatedAt { get; private set; }
    public bool IsDeleted { get; private set; }
    public DateTime? DeletedAt { get; private set; }

    // Navigation property for the associated file
    public File File { get; private set; } = null!;

    // Navigation property for the optional category
    public SoundCategory? Category { get; set; }

    // Navigation property for many-to-many relationship with Packs - EF Core requires this to be settable
    public ICollection<Pack> Packs
    {
        get => _packs;
        set
        {
            _packs.Clear();
            if (value != null)
                _packs.AddRange(value);
        }
    }

    // Navigation property for many-to-many relationship with Projects - EF Core requires this to be settable
    public ICollection<Project> Projects
    {
        get => _projects;
        set
        {
            _projects.Clear();
            if (value != null)
                _projects.AddRange(value);
        }
    }

    /// <summary>
    /// Creates a new Sound with the specified file and metadata.
    /// </summary>
    /// <param name="name">The name of the sound</param>
    /// <param name="file">The file containing the sound data</param>
    /// <param name="duration">Duration in seconds</param>
    /// <param name="peaks">JSON string containing waveform peak data</param>
    /// <param name="createdAt">When the sound was created</param>
    /// <param name="categoryId">Optional category ID</param>
    /// <returns>A new Sound instance</returns>
    /// <exception cref="ArgumentNullException">Thrown when file is null</exception>
    /// <exception cref="ArgumentException">Thrown when validation fails</exception>
    public static Sound Create(string name, File file, double duration, string? peaks, DateTime createdAt, int? categoryId = null)
    {
        ValidateName(name);
        ValidateFile(file);
        ValidateDuration(duration);

        return new Sound
        {
            Name = name.Trim(),
            FileId = file.Id,
            File = file,
            Duration = duration,
            Peaks = peaks,
            SoundCategoryId = categoryId,
            CreatedAt = createdAt,
            UpdatedAt = createdAt
        };
    }

    /// <summary>
    /// Updates the name of the sound.
    /// </summary>
    /// <param name="name">The new name</param>
    /// <param name="updatedAt">When the update occurred</param>
    /// <exception cref="ArgumentException">Thrown when name validation fails</exception>
    public void UpdateName(string name, DateTime updatedAt)
    {
        ValidateName(name);

        Name = name.Trim();
        UpdatedAt = updatedAt;
    }

    /// <summary>
    /// Updates the category of the sound.
    /// </summary>
    /// <param name="categoryId">The new category ID, or null to remove category</param>
    /// <param name="updatedAt">When the update occurred</param>
    public void UpdateCategory(int? categoryId, DateTime updatedAt)
    {
        SoundCategoryId = categoryId;
        UpdatedAt = updatedAt;
    }

    /// <summary>
    /// Updates the waveform peaks data.
    /// </summary>
    /// <param name="peaks">The new peaks data</param>
    /// <param name="updatedAt">When the update occurred</param>
    public void UpdatePeaks(string? peaks, DateTime updatedAt)
    {
        Peaks = peaks;
        UpdatedAt = updatedAt;
    }

    /// <summary>
    /// Persists audio metadata extracted by the worker (sample rate, channels, format).
    /// The worker decodes the file with ffprobe, so its duration is authoritative —
    /// it overwrites the create-time duration when a positive value is provided
    /// (create-time duration is frequently 0 before processing).
    /// Extraction failures degrade to null and simply leave the corresponding field unset.
    /// </summary>
    /// <param name="sampleRate">Sample rate in Hz, or null if unavailable</param>
    /// <param name="channels">Channel count, or null if unavailable</param>
    /// <param name="format">Container/codec format, or null if unavailable</param>
    /// <param name="durationFromWorker">Authoritative duration in seconds; ignored when not positive</param>
    /// <param name="updatedAt">When the update occurred</param>
    public void UpdateAudioMetadata(int? sampleRate, int? channels, string? format, double durationFromWorker, DateTime updatedAt)
    {
        SampleRate = sampleRate is > 0 ? sampleRate : null;
        Channels = channels is > 0 ? channels : null;
        // Clamp to the Format column cap (20). Real audio format tokens are short
        // (mp3, wav, ogg…); the clamp just guards against a pathological probe value
        // tripping a DB length error on a best-effort metadata write.
        var normalizedFormat = string.IsNullOrWhiteSpace(format) ? null : format.Trim().ToLowerInvariant();
        Format = normalizedFormat is { Length: > 20 } ? normalizedFormat[..20] : normalizedFormat;
        if (durationFromWorker > 0)
            Duration = durationFromWorker;
        UpdatedAt = updatedAt;
    }

    /// <summary>
    /// Soft deletes this sound by marking it as deleted.
    /// </summary>
    /// <param name="deletedAt">When the sound was deleted</param>
    public void SoftDelete(DateTime deletedAt)
    {
        IsDeleted = true;
        DeletedAt = deletedAt;
        UpdatedAt = deletedAt;
    }

    /// <summary>
    /// Restores a soft-deleted sound.
    /// </summary>
    /// <param name="restoredAt">When the sound was restored</param>
    public void Restore(DateTime restoredAt)
    {
        IsDeleted = false;
        DeletedAt = null;
        UpdatedAt = restoredAt;
    }

    private static void ValidateName(string name)
    {
        if (string.IsNullOrWhiteSpace(name))
            throw new ArgumentException("Sound name cannot be null or empty.", nameof(name));

        if (name.Length > 200)
            throw new ArgumentException("Sound name cannot exceed 200 characters.", nameof(name));
    }

    private static void ValidateFile(File? file)
    {
        if (file is null)
            throw new ArgumentNullException(nameof(file), "File cannot be null.");
    }

    private static void ValidateDuration(double duration)
    {
        if (duration < 0)
            throw new ArgumentException("Sound duration cannot be negative.", nameof(duration));
    }
}
