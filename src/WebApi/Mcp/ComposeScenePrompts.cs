using System.ComponentModel;
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
    public static string ComposeScene(
        [Description("What the scene should be, e.g. 'a small living room with a sofa facing a TV'.")] string description,
        [Description("Existing scene id to continue building. Omit to start a new scene.")] int? sceneId = null)
    {
        var target = sceneId is { } id
            ? $"Continue scene {id}. Call get_scene({id}) first and work out which stage below it has reached."
            : "Create the scene with create_scene, then build it up through the stages below.";

        return $$"""
        You are composing a scene in Modelibr from assets already in the library.

        Target: {{description}}
        {{target}}

        WORK IN STAGES. Do not dress a scene that is not blocked out yet - fixing the
        composition after the props are placed means re-placing every one of them.

          Stage 1 - Layout.   Room shell (floor, walls), then the large furniture.
                              Nothing decorative.
          Stage 2 - Verify.   validate_scene, then render_scene. Fix before continuing.
          Stage 3 - Detail.   Props, and things resting on other things.
          Stage 4 - Verify.   Again. Same two calls.
          Stage 5 - Light.    Ambient is FILL, never key. Add at least one directional,
                              point or spot light or the scene has no form at all.
          Stage 6 - Material. Colour and finish, only now that the composition is right.
          Stage 7 - Render.   Look at the final image.

        CHOOSING AN ASSET
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
}
