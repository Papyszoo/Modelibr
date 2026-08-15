using SharedKernel;

namespace Domain.Models;

/// <summary>
/// A scene composed out of the library: library assets placed, transformed, lit and
/// materialled, authored by a user in the editor or by an agent over MCP.
///
/// The aggregate deliberately holds the document as an opaque, already-validated JSON
/// string. The shape lives in <see cref="Domain.Scenes.SceneDocument"/> and is enforced by
/// <see cref="Domain.Scenes.SceneDocumentValidator"/> before it ever reaches here, so there
/// is exactly one place that decides whether a document is legal - and it is not "whatever
/// the last writer happened to serialize".
///
/// This is not the old <c>Stage</c> with more fields. Stage is a lighting rig for viewing
/// one model, its config is parsed with an unversioned <c>JSON.parse</c>, and nothing in it
/// can reference a library asset.
/// </summary>
public class Scene : AggregateRoot
{
    public int Id { get; private set; }
    public string Name { get; private set; } = string.Empty;
    public string? Description { get; private set; }

    /// <summary>
    /// The document's schema version, mirrored out of the JSON into a column so a future
    /// migration can find every document written at a given version without parsing them all.
    /// </summary>
    public int SchemaVersion { get; private set; }

    public string DocumentJson { get; private set; } = string.Empty;

    /// <summary>
    /// Increments on every accepted document write. The editor and an agent both use it to
    /// notice that the scene moved under them - twenty agent placements against a stale
    /// revision are twenty edits applied to a scene that no longer exists.
    /// </summary>
    public int Revision { get; private set; }

    public DateTime CreatedAt { get; private set; }
    public DateTime UpdatedAt { get; private set; }

    private Scene() { } // For EF Core

    private Scene(string name, string? description, int schemaVersion, string documentJson, DateTime now)
    {
        Name = name;
        Description = description;
        SchemaVersion = schemaVersion;
        DocumentJson = documentJson;
        Revision = 1;
        CreatedAt = now;
        UpdatedAt = now;
    }

    public static Result<Scene> Create(
        string name,
        string documentJson,
        int schemaVersion,
        DateTime now,
        string? description = null)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            return Result.Failure<Scene>(new Error("Scene.InvalidName", "A scene needs a name."));
        }

        if (string.IsNullOrWhiteSpace(documentJson))
        {
            return Result.Failure<Scene>(new Error("Scene.InvalidDocument", "A scene needs a document."));
        }

        return Result.Success(new Scene(name.Trim(), description, schemaVersion, documentJson, now));
    }

    /// <summary>
    /// Replaces the document. The caller is responsible for having validated it - this
    /// method is the last step of a write, not the gate on it.
    /// </summary>
    public Result ReplaceDocument(string documentJson, int schemaVersion, DateTime now)
    {
        if (string.IsNullOrWhiteSpace(documentJson))
        {
            return Result.Failure(new Error("Scene.InvalidDocument", "A scene document cannot be empty."));
        }

        DocumentJson = documentJson;
        SchemaVersion = schemaVersion;
        Revision++;
        UpdatedAt = now;
        return Result.Success();
    }

    public Result Rename(string name, DateTime now)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            return Result.Failure(new Error("Scene.InvalidName", "A scene needs a name."));
        }

        Name = name.Trim();
        UpdatedAt = now;
        return Result.Success();
    }

    public void Describe(string? description, DateTime now)
    {
        Description = description;
        UpdatedAt = now;
    }
}
