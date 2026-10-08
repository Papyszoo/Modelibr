using System.Text.Json;

namespace Application.Vfx;

/// <summary>One row of the effect list: enough to browse without opening the definition.</summary>
public sealed record VfxSummaryDto(
    int Id,
    string Name,
    string? Description,
    double Duration,
    int ComponentCount,
    IReadOnlyList<string> ComponentTypes,
    DateTime UpdatedAt)
{
    public static VfxSummaryDto From(Domain.Models.Vfx vfx)
    {
        var summary = VfxDefinition.Summarize(vfx.DefinitionJson);

        return new VfxSummaryDto(
            vfx.Id,
            vfx.Name,
            vfx.Description,
            summary.Duration,
            summary.ComponentCount,
            summary.ComponentTypes,
            vfx.UpdatedAt);
    }
}

/// <summary>One effect in full: the validated definition as a JSON object, not a string.</summary>
public sealed record VfxDetailDto(
    int Id,
    string Name,
    string? Description,
    JsonElement Definition,
    DateTime CreatedAt,
    DateTime UpdatedAt)
{
    public static VfxDetailDto From(Domain.Models.Vfx vfx) => new(
        vfx.Id,
        vfx.Name,
        vfx.Description,
        ParseDefinition(vfx.DefinitionJson),
        vfx.CreatedAt,
        vfx.UpdatedAt);

    private static JsonElement ParseDefinition(string definitionJson)
    {
        if (string.IsNullOrWhiteSpace(definitionJson))
            return EmptyObject();

        try
        {
            using var document = JsonDocument.Parse(definitionJson);
            return document.RootElement.Clone();
        }
        catch (JsonException)
        {
            return EmptyObject();
        }
    }

    private static JsonElement EmptyObject()
    {
        using var document = JsonDocument.Parse("{}");
        return document.RootElement.Clone();
    }
}

/// <summary>
/// The result of a create or update. A rejected definition is a first-class outcome
/// rather than an <c>Error</c>: <see cref="SharedKernel.Error"/> carries only a code and
/// a message, and the caller needs every problem's path so the editor and the agent can
/// show and fix all of them at once.
/// </summary>
public sealed record VfxWriteOutcome(VfxDetailDto? Vfx, IReadOnlyList<VfxProblem> Problems)
{
    public bool IsValid => Vfx is not null && Problems.Count == 0;

    public static VfxWriteOutcome Saved(VfxDetailDto vfx) => new(vfx, []);

    public static VfxWriteOutcome Invalid(IReadOnlyList<VfxProblem> problems) => new(null, problems);
}
