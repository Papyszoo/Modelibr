namespace Application.ScriptTemplates;

/// <summary>
/// A script template surfaced to the UI. <paramref name="Id"/> is a string so
/// built-in templates ("builtin:&lt;key&gt;") and custom ones (the numeric DB id
/// as a string) can share one list. Only custom templates are editable.
/// </summary>
public record ScriptTemplateDto(
    string Id,
    string Name,
    string Language,
    string? Description,
    string Content,
    bool IsBuiltIn);
