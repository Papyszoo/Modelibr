namespace Domain.Models;

/// <summary>
/// A picture of a scene, taken from one viewpoint at one moment.
///
/// Kept apart from the <see cref="ThumbnailJob"/> that asked for it, the same way
/// <see cref="Thumbnail"/> is kept apart from its job: the job is a request with a
/// lifecycle - claimed, retried, dead-lettered - and this is the artifact that outlives
/// it. An agent polls for the artifact and does not care how many attempts it took.
///
/// Unlike a thumbnail there is no uniqueness here, by design. A thumbnail is derived from
/// bytes, so re-deriving it produces the same image; a scene render answers "what does
/// this look like now", and the scene moves. Renders accumulate, and the newest one for a
/// scene is the current answer rather than the only one.
/// </summary>
public class SceneRender
{
    public int Id { get; private set; }

    /// <summary>The scene that was photographed.</summary>
    public int SceneId { get; private set; }

    /// <summary>
    /// The job that produced this render. This is the id an agent is handed when a
    /// render does not finish inside the tool's wait, and the one it polls with.
    /// </summary>
    public int ThumbnailJobId { get; private set; }

    /// <summary>Which way the camera looked: iso, front, side or top.</summary>
    public string Viewpoint { get; private set; } = string.Empty;

    /// <summary>Where the stored image lives.</summary>
    public string FilePath { get; private set; } = string.Empty;

    public long SizeBytes { get; private set; }
    public int Width { get; private set; }
    public int Height { get; private set; }

    /// <summary>
    /// How many of the scene's asset-bearing nodes drew, and how many failed to.
    ///
    /// Recorded rather than inferred from the picture because a render is deliberately
    /// returned even when a node never resolves - a scene with a hole in it is exactly
    /// what an agent needs to see, but it has no way to tell that hole from empty floor
    /// by looking. These two numbers are what makes the picture readable.
    /// </summary>
    public int NodesLoaded { get; private set; }
    public int NodesFailed { get; private set; }

    /// <summary>
    /// True when the page never reported itself ready and was photographed anyway.
    /// The image is still usable; it may just be mid-load.
    /// </summary>
    public bool TimedOut { get; private set; }

    public DateTime CreatedAt { get; private set; }

    // Navigation
    public Scene? Scene { get; set; }

    public static SceneRender Create(
        int sceneId,
        int thumbnailJobId,
        string viewpoint,
        string filePath,
        long sizeBytes,
        int width,
        int height,
        int nodesLoaded,
        int nodesFailed,
        bool timedOut,
        DateTime createdAt)
    {
        if (sceneId <= 0)
            throw new ArgumentException("Scene ID must be a positive integer.", nameof(sceneId));
        if (thumbnailJobId <= 0)
            throw new ArgumentException("Thumbnail job ID must be a positive integer.", nameof(thumbnailJobId));
        if (string.IsNullOrWhiteSpace(viewpoint))
            throw new ArgumentException("Viewpoint cannot be null or whitespace.", nameof(viewpoint));
        if (string.IsNullOrWhiteSpace(filePath))
            throw new ArgumentException("File path cannot be null or whitespace.", nameof(filePath));

        return new SceneRender
        {
            SceneId = sceneId,
            ThumbnailJobId = thumbnailJobId,
            Viewpoint = viewpoint.Trim(),
            FilePath = filePath,
            SizeBytes = sizeBytes,
            Width = width,
            Height = height,
            NodesLoaded = nodesLoaded,
            NodesFailed = nodesFailed,
            TimedOut = timedOut,
            CreatedAt = createdAt
        };
    }
}
