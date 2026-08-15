using System.Text.Json;
using System.Text.Json.Serialization;
using Domain.Scenes;
using SharedKernel;

namespace Application.Scenes;

/// <summary>
/// Turns scene-document JSON into the validated contract and back.
///
/// The one place a document crosses the JSON boundary, so the rejection rule holds
/// everywhere: <b>a document that does not parse, or does not validate, is an error.</b>
/// The feature this replaces caught the parse failure and handed the user an empty stage
/// with a toast - which loses a scene and reports success.
///
/// Unknown members are rejected too. Ignoring them looks forgiving and is the opposite for
/// an agent: a misspelled <c>positon</c> would be dropped in silence and the agent would
/// carry on believing it had placed something.
/// </summary>
public static class SceneDocumentCodec
{
    /// <summary>
    /// camelCase, because the same document is read by the editor and written by agents
    /// against the generated TypeScript contract. Indentation is off: these documents are
    /// machine-written far more often than they are read in a database client.
    /// </summary>
    public static readonly JsonSerializerOptions Options = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
        WriteIndented = false,
    };

    /// <summary>
    /// Parses and validates. On failure the error carries every issue found, not just the
    /// first: an agent that has to re-submit once per problem burns a turn per typo.
    /// </summary>
    public static Result<SceneDocument> Parse(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return Result.Failure<SceneDocument>(
                new Error("Scene.DocumentMissing", "A scene document is required."));
        }

        SceneDocument? document;
        try
        {
            document = JsonSerializer.Deserialize<SceneDocument>(json, Options);
        }
        catch (JsonException ex)
        {
            return Result.Failure<SceneDocument>(new Error(
                "Scene.DocumentUnreadable",
                $"The scene document is not valid JSON for the scene schema: {ex.Message}"));
        }

        if (document is null)
        {
            return Result.Failure<SceneDocument>(new Error(
                "Scene.DocumentUnreadable", "The scene document parsed to null."));
        }

        // A document that parses can still be nonsense - two nodes sharing an id, a model
        // node with no pinned version, a scale of zero. Structure and rules are separate
        // gates and both have to pass.
        var issues = SceneDocumentValidator.Validate(document);
        return issues.Count == 0
            ? Result.Success(document)
            : Result.Failure<SceneDocument>(ToError(issues));
    }

    /// <summary>Validates an already-materialised document, for the tools that build one in memory.</summary>
    public static Result<SceneDocument> Validate(SceneDocument document)
    {
        var issues = SceneDocumentValidator.Validate(document);
        return issues.Count == 0 ? Result.Success(document) : Result.Failure<SceneDocument>(ToError(issues));
    }

    public static string Serialize(SceneDocument document) => JsonSerializer.Serialize(document, Options);

    /// <summary>
    /// Reads a stored document. Distinct from <see cref="Parse"/> so a document that was
    /// valid when written but no longer parses is reported as the data problem it is,
    /// rather than as the caller's bad input.
    /// </summary>
    public static Result<SceneDocument> ParseStored(string json, int sceneId)
    {
        var parsed = Parse(json);
        return parsed.IsSuccess
            ? parsed
            : Result.Failure<SceneDocument>(new Error(
                "Scene.StoredDocumentUnreadable",
                $"Scene {sceneId}'s stored document cannot be read ({parsed.Error.Message}). It is preserved as-is rather than replaced - export it before editing this scene."));
    }

    /// <summary>
    /// Folds validation issues into one <see cref="Error"/>. Paths and codes survive into
    /// the message because <c>Error</c> carries no structured detail (prompt 26); the MCP
    /// tools surface the issue list separately, where the transport allows it.
    /// </summary>
    public static Error ToError(IReadOnlyList<SceneValidationIssue> issues)
    {
        var detail = string.Join("; ", issues.Select(i =>
            string.IsNullOrEmpty(i.Path) ? $"{i.Code}: {i.Message}" : $"{i.Path} [{i.Code}]: {i.Message}"));

        return new Error(
            "Scene.DocumentInvalid",
            $"The scene document was rejected ({issues.Count} problem{(issues.Count == 1 ? "" : "s")}): {detail}");
    }
}
