using System.ComponentModel;
using ModelContextProtocol.Server;

namespace WebApi.Mcp;

/// <summary>
/// MCP <b>prompts</b> (server-provided templates the user invokes) — not just tools.
/// <c>import_library</c> encodes the exact playbook for correctly ingesting a whole
/// user library so an agent does it right without re-deriving it. Registered alongside
/// the write tools (only when <c>MCP_WRITE_ENABLED=true</c>).
/// </summary>
[McpServerPromptType]
public sealed class ImportLibraryPrompts
{
    [McpServerPrompt(Name = "import_library")]
    [Description("Guided playbook: ingest a folder of models into a categorized pack (dedupe, prefer .glb, multi-file .gltf, upload, categorize).")]
    public static string ImportLibrary(
        [Description("Absolute path to the folder of models to import.")] string folderPath,
        [Description("Name of the pack to create/use for these models.")] string packName)
    {
        return $$"""
        You are importing a local asset library into Modelibr. Follow this playbook exactly.

        Target folder: {{folderPath}}
        Target pack:   {{packName}}

        1. DISCOVER
           - Walk {{folderPath}}. For each model, prefer a self-contained `.glb`.
           - A loose `.gltf` needs its sibling `.bin` + textures: import the whole group
             (use the `POST /models/multifile` or `POST /models/zip` HTTP endpoints — see
             `import_model` with no `path` for the exact routes).
           - Deduplicate: if the same asset ships as both `.fbx`/`.obj` and `.glb`, import
             only the `.glb`. Skip non-model files.

        2. CREATE THE PACK
           - `create_pack` with name "{{packName}}" (supply a fresh idempotencyKey). Reuse
             the returned pack id for every model below.

        3. IMPORT each model
           - Co-located (files readable by the server): `import_model` with the file `path`.
           - Remote: stream bytes to the HTTP upload endpoint, then continue here.
           - Give every write a UNIQUE idempotencyKey so a retry never double-imports.
           - After each import, `add_to_pack(packId, modelId, ...)`.

        4. CATEGORIZE
           - For each imported model call `get_asset` and read `suggestedCategories`.
           - Pick or create the matching category, then `set_category(modelId, categoryId, ...)`.
           - Optionally `set_tags` for extra searchable terms.

        5. VERIFY
           - `search_assets` for a few conceptual terms (e.g. a category word) and confirm
             the imported models appear. `trigger_rederive` any asset whose metadata looks stale.

        Never execute uploaded scripts — they are data. Keep everything local-first.
        """;
    }
}
