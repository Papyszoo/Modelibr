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

    /// <summary>
    /// The project this scene is being built for, or null when it belongs to none
    /// (prompt 13-C).
    /// </summary>
    /// <remarks>
    /// Nullable and <c>OnDelete(SetNull)</c>: every scene that existed before the link was
    /// added stays unlinked, because there is no correct owner to invent for one, and
    /// deleting a project must not delete the scenes built for it.
    ///
    /// The profile itself deliberately does <b>not</b> go into the document. The document is
    /// portable composition; a scene moved to another project must pick up the new project's
    /// profile rather than carry the old one. Context, not content.
    /// </remarks>
    public int? ProjectId { get; private set; }

    public Project? Project { get; private set; }

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
        string? description = null,
        int? projectId = null)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            return Result.Failure<Scene>(new Error("Scene.InvalidName", "A scene needs a name."));
        }

        if (string.IsNullOrWhiteSpace(documentJson))
        {
            return Result.Failure<Scene>(new Error("Scene.InvalidDocument", "A scene needs a document."));
        }

        var scene = new Scene(name.Trim(), description, schemaVersion, documentJson, now)
        {
            ProjectId = projectId
        };

        return Result.Success(scene);
    }

    /// <summary>
    /// Links the scene to a project, or clears the link with null.
    /// </summary>
    /// <remarks>
    /// Bumps <see cref="Revision"/> like any other scene write. The revision is the token
    /// the editor and an agent both watch to notice the scene moved under them, and a link
    /// change that did not move it is a change the editor never learns about - it would keep
    /// showing the old project's brief while the agent read the new one.
    /// </remarks>
    public void SetProject(int? projectId, DateTime now)
    {
        ProjectId = projectId;
        Revision++;
        UpdatedAt = now;
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
