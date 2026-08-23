using System.ComponentModel;
using Application.Abstractions.Messaging;
using Application.Projects.Profile;
using ModelContextProtocol.Server;

namespace WebApi.Mcp;

/// <summary>
/// The MCP <b>prompt</b> for building a scene out of the library.
///
/// Deliberately the <i>last</i> of three tiers, and deliberately small. The errors from the
/// run this was written from split into three kinds, and only the third belongs here:
///
/// <list type="number">
/// <item>Errors made impossible in the tools - <c>groundSnap</c> is a node property that
/// sticks across moves, an anchor keeps a node on its surface when that surface moves, and
/// grounding measures the origin instead of trusting a label.</item>
/// <item>Errors made detectable - <c>validate_scene</c>, and the findings that ride on every
/// write response.</item>
/// <item>What is left: sequencing and judgement. A prompt is advice the model may skip, with
/// no signal when it does, so a rule belongs here only when it cannot live in the two tiers
/// above.</item>
/// </list>
///
/// The rule this text exists to counter is the one that made the original run fail: the scene
/// passed every check the server offered while being visibly broken, so "verify before you
/// finish" made the agent <i>more</i> confident in a wrong scene. Hence the insistence that
/// verification ends with a render the model actually looks at.
///
/// Registered with the write tools - composing a scene is writing.
/// </summary>
[McpServerPromptType]
public sealed class ComposeScenePrompts
{
    [McpServerPrompt(Name = "compose_scene")]
    [Description("Guided playbook: build a complete scene from the library in stages - block out, verify, detail, light, then colour - and verify each stage with validate_scene and render_scene.")]
    public static async Task<string> ComposeScene(
        IQueryHandler<GetProjectBriefQuery, ProjectBriefDto> projectBriefs,
        [Description("What the scene should be, e.g. 'a small living room with a sofa facing a TV'.")] string description,
        [Description("Existing scene id to continue building. Omit to start a new scene.")] int? sceneId = null,
        [Description("The project this scene is for. Its brief is inlined below and constrains every asset choice.")] int? projectId = null,
        CancellationToken cancellationToken = default)
    {
        var target = sceneId is { } id
            ? $"Continue scene {id}. Call get_scene({id}) first - its `scene.stage` says which stage below it has reached."
            : "Create the scene with create_scene, then build it up through the stages below.";

        // Inlined above CHOOSING AN ASSET, which is the section it constrains. A brief that
        // arrived after the choosing rules would be advice about a decision already made.
        var projectBlock = await ProjectBlockAsync(projectBriefs, projectId, cancellationToken);

        return $$"""
        You are composing a scene in Modelibr, primarily from assets already in the
        library - see WHEN THE LIBRARY CANNOT ANSWER for the exception.

        Target: {{description}}
        {{target}}

        WORK IN STAGES, and declare each one with set_scene_stage. Do not dress a scene
        that is not blocked out yet - fixing the composition after the props are placed
        means re-placing every one of them, and levitation that is glaring in a grey
        blockout is easy to miss in a lit, textured render.

          set_scene_stage "layout"    Room shell (floor, walls), then the large
                                      furniture. Nothing decorative.
              Verify: validate_scene, then render_scene. Fix before continuing.
          set_scene_stage "detail"    Props, and things resting on other things.
              Verify: again, same two calls.
          set_scene_stage "lit"       Ambient is FILL, never key. Add at least one
                                      directional, point or spot light or the scene has
                                      no form at all.
          set_scene_stage "dressed"   Colour, finish and materials - only now that the
                                      composition is right.
              Finish: render_scene, and look at the image.

        The stage is not a label. Until the scene reaches "lit" and "dressed",
        validate_scene reports missing lights and missing materials as notes rather than
        warnings, so what is wrong NOW is not buried under what is not due yet. And
        moving forward is REFUSED while any node is standing on nothing: fix it with
        groundSnap / on, or pass suspended=true for something meant to hang. Moving back
        a stage always works, and is how a scene is reopened to fix its composition.

        {{projectBlock}}CHOOSING AN ASSET
          - Dimensions in search results are the asset's own, and roughly half the library
            is bounds-normalised to about 2 m on its longest axis. A hit reporting a
            longest axis near 2.00 with scaleConvention "normalized" is telling you its
            size means nothing - place it and read the size back rather than scaling from
            the hit.
          - Call get_asset before placing. Reject an asset whose parts include cameras or
            lights: that is a sample scene, not a prop. A hit named after one part of an
            asset is not that part - place_asset(assetId) places the whole thing it lives
            in, at the whole thing's size.
          - Prefer .glb. An FBX renders untextured in a scene, by design.

        WHEN THE LIBRARY CANNOT ANSWER
          The library is the default and the fast answer: search_assets first, every time.
          But a brief the library cannot meet is a real outcome, and settling for the
          closest wrong asset is worse than saying so. If STORE_URL is configured,
          search_store_assets looks at the companion Asset Store.
          - Reach for it when the library's best hit FAILS the brief - wrong style for the
            project, wrong scale, no UVs, or nothing at all. Not when the local hit is
            merely second-best. An agent that proposes downloads for things the user
            already owns is worse than one that never mentions the store.
          - Say why it beats the local candidate, in the rationale you pass to
            propose_candidates. "Nothing in the library is low-poly" is a reason.
            "Found on the store" is not one.
          - Never propose a hit whose `alreadyImported` is true - that asset is in the
            library already; search for it there.
          - Store search is coarse: it matches an asset's title, author and description,
            never the names of the items inside a pack, and store tagging is sparse
            enough that a tag filter returning nothing means nothing. Search wide by
            itemType and read the items with get_store_asset.
          - A free asset you can fetch yourself: import_store_asset, then get_store_import
            for the pack id. A paid one you cannot, ever - propose it as a slot candidate
            and let the user accept it while signed in. The whole rule in one line: the
            agent fetches free assets by itself and never paid ones.
          - The store is remote and optional. StoreCatalog.Unreachable means the store is
            down, NOT that it has no chairs, and nothing about the local library or the
            scene depends on it being up.

        PLACING
          - Place one, read `node.footprint` and `node.sourceDimensions` off the response,
            then scale. Never scale from a search hit.
          - Use groundSnap=true instead of computing a Y. It is remembered: a later
            move_asset that does not mention it keeps the node on the floor.
          - For anything resting on something else, pass on="<nodeId>" rather than
            computing a height. The node then follows its surface when that surface moves
            or is swapped.
          - Use faceToward=[x,y,z] to aim things. If an asset ends up backwards, declare
            frontAxis - nothing in the library derives which way an asset faces.
          - For rows - fence posts, a colonnade, street lamps - use distribute_assets.
          - Anything genuinely hanging in mid-air - a pendant lamp, a sign - needs
            suspended=true. Otherwise it is reported as floating for the life of the
            scene, and it will hold up the next set_scene_stage.

        VERIFYING - a scene is not correct because its numbers are
          - Read the `findings` on every write response. They are scoped to what you just
            placed, and they are what tells you the "rug" you just placed is a twelve-part
            test scene with two lights in it.
          - validate_scene returns a verdict plus `coverage.limitations`. Read the
            limitations: footprints are axis-aligned boxes, so nothing on the server can
            see that a wall is facing the wrong way, and a square panel rotated 90 degrees
            is identical to one that is not.
          - Overlaps are expected wherever things touch - cushions on a sofa, legs on a
            rug. Judge them by which pair overlaps, not by how many do.
          - Finish by calling render_scene and looking at the image. It is the only check
            that sees facing, framing, and whether an asset loaded at all. A scene that
            validates clean and looks wrong is wrong.

        Give every write a unique idempotencyKey, and a shared batchId per stage so a
        stage can be undone in one call with reverse_operation. Everything stays local.
        """;
    }

    /// <summary>
    /// The project's constraints as a THIS PROJECT block, or empty when the scene belongs to
    /// no project. Empty rather than a placeholder: a heading with nothing under it reads as
    /// a constraint the agent failed to find.
    /// </summary>
    private static async Task<string> ProjectBlockAsync(
        IQueryHandler<GetProjectBriefQuery, ProjectBriefDto> projectBriefs,
        int? projectId,
        CancellationToken cancellationToken)
    {
        if (projectId is not int id) return string.Empty;

        var result = await projectBriefs.Handle(new GetProjectBriefQuery(id), cancellationToken);
        if (result.IsFailure) return string.Empty;

        var brief = result.Value;
        var lines = new List<string> { $"        THIS PROJECT - {brief.Name}" };

        if (!string.IsNullOrWhiteSpace(brief.Description))
        {
            lines.Add($"          {brief.Description.Trim()}");
        }

        foreach (var line in brief.Guidance)
        {
            lines.Add($"          - {line}");
        }

        if (brief.WorldConvention.EngineConversions.Count > 0)
        {
            lines.Add($"          - Engine conversions from this project's units: {string.Join("; ", brief.WorldConvention.EngineConversions)}.");
        }

        if (brief.Guidance.Count == 0 && brief.WorldConvention.EngineConversions.Count == 0)
        {
            // A project with an empty profile constrains nothing, and saying so is more
            // useful than an empty heading - it tells the agent the silence is real.
            lines.Add("          - This project has no profile set yet, so nothing here narrows the asset choice.");
        }

        // How to act on the profile, not just what it says. A brief the agent reads and then
        // searches as if it had not is a brief that changed nothing (prompt 13-D3/D5).
        lines.Add(FormattableString.Invariant(
            $"          - Search with search_assets(projectId: {brief.Id}). It ranks by this project's style and puts each hit's profileFit beside it; applyProfile: \"enforce\" makes the budget a filter and says how many assets that removed."));
        lines.Add("          - Every candidate you propose is measured against this profile by the server, not by your rationale. Read the profileFit back, and if you propose something outside the profile, say so rather than letting the card be the only thing that mentions it.");

        lines.Add(string.Empty);
        return string.Join(Environment.NewLine, lines) + Environment.NewLine + "        ";
    }
}
