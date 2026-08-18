---
sidebar_position: 14
---

# Agent server (MCP)

Modelibr ships a local [Model Context Protocol](https://modelcontextprotocol.io)
server so an AI agent - Claude Code, the Claude desktop app, or an IDE
extension - can search your asset library and pick the right asset for a task.
Ask "find me a low-poly medieval prop with no animations" and the agent queries
the same full-text + fuzzy search the app uses, then reads the deterministic
metadata Modelibr extracts for each asset.

The server is **local-first**: it runs inside your own Modelibr instance, never
calls a hosted service, and works fully offline. It is **read-only by default** -
the tools that change anything only appear when you opt in with
`MCP_WRITE_ENABLED=true`.

## What the agent can read

These eight library tools are always available, each a thin wrapper over an
ordinary Modelibr API endpoint - there is no separate search or extraction path:

| Tool                | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `search_assets`     | Full-text + fuzzy-identifier search with structural filters - triangle/vertex/part counts, size (bounding-box dimension), rig (`hasRig`/bone count), materials, UVs, animations, shape class, engine, asset type, and **category**. Every query word is scored on its own, so a document matching more of them ranks higher, and plurals find their singular. Conceptual queries (`weapon`, `vehicle`, `building`) hit via deterministic concept labels, ranked below assets whose author actually named them that. Tags and descriptions a person assigned are searched too, ranked with authored names rather than with inferred concepts. Leave the query blank to browse by filters alone. Returns one ranked hit **per asset** (current version only), each carrying a short browse summary **and its structural facts** - triangles, size, parts, materials, UVs, rig, animations - so an agent can compare candidates without a follow-up call per hit. A hit always identifies the **whole, placeable asset**; when the query actually matched a mesh inside it, that mesh is reported separately as `matchedPart`, since `place_asset` places the asset and cannot place a part. |
| `get_asset`         | The derived metadata, part list and `materialSlots` for an asset, plus `suggestedCategories` (deterministic concept-label suggestions the user/agent can confirm-assign). Defaults to the asset's **active** version; pass the `versionId` from a search hit to inspect exactly the version that hit named.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `get_part`          | A single part's detail, addressed by its part-path (e.g. `/Building/Roof`). Takes the same optional `versionId`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `compute_on_demand` | A cached expensive metric (exact surface area, manifold check, …) keyed by geometry hash, or `pending` if it has not been computed yet. Queue the computation with `analyze_meshes`. UV overlap and texel density are **not** answerable here - they depend on the UV layout, which the geometry hash ignores.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `list_facets`       | The structural filters `search_assets` accepts and their value ranges (including size, rig, materials, UVs, part counts, and category), so the agent can compose filters without guessing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `list_materials`    | Browse the material library: **parameter materials** (a colour and a roughness - no UVs needed) and **tiling global materials** (image channels, which do need UVs) in one list, because both attach to a model's material slot. Every hit carries `requiresUvs`, so an agent dressing an asset with a bad or missing unwrap can ask for only what will look right on it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `get_material`      | One parameter material in full - every factor, its render state, its category and tags.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `get_job_status`    | What a queued job is doing, and once it has finished, what it produced - the new version id an unwrap wrote, for instance. Pass `waitSeconds` to block for the verdict instead of writing a polling loop; the job runs on regardless. This is how you collect the result of any tool that hands back a job id.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |     |

### Looking at a scene

Reading a scene is a read: an agent that can search the library can look at what it has
already built there. These five need no write flag either.

| Tool               | What it does                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list_scenes`      | Saved scenes with their node and light counts, newest edit first.                                                                                                                                                                                                                                                                                                                                       |
| `get_scene`        | A scene's document plus, per node, the world footprint after transform, the source asset's own dimensions, where its origin sits inside those bounds and how far it is off the ground - with every overlapping pair and scale warning in the scene. The viewport-free inspector.                                                                                                                        |
| `validate_scene`   | The mistakes the numbers above cannot show: something resting on nothing, geometry under the floor, an asset that is a whole sample scene rather than the prop it was placed as, nodes tilted or upside down, a scene with no key light, objects inside each other. Returns a verdict, findings with stable codes, **and what it could not check** - including which stage it judged the scene against. |
| `render_scene`     | Photograph the scene through the same component the editor draws with, and get the image back. The only check that sees facing, framing and whether an asset loaded at all. The reply names the scene revision the picture was asked for and the one it was drawn at, so a render that was overtaken by another edit cannot be mistaken for confirmation of your own.                                   |
| `get_scene_render` | Collect a render by id.                                                                                                                                                                                                                                                                                                                                                                                 |

`validate_scene` deliberately reports its own blind spots. Footprints are axis-aligned
boxes, so a square panel rotated 90° about Y is identical to one that is not - nothing on
the server can see that a wall faces the wrong way. A clean verdict means "nothing I can
measure is wrong", which is why the tool descriptions all end at the same place: render it
and look.

## What the agent can change (opt-in)

Set `MCP_WRITE_ENABLED=true` in your root `.env` and thirty more tools appear,
letting an agent curate the library the way you would in the app. They are a thin
pass-through over the same command handlers the UI uses, so there is one source
of truth for what a change means:

| Tool               | What it does                                                                                                                                                                            |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `set_tags`         | Replace a model's tags (and optionally its description), preserving its category.                                                                                                       |
| `set_category`     | Assign or clear a model's category without touching tags.                                                                                                                               |
| `create_pack`      | Create a pack (a curated collection).                                                                                                                                                   |
| `add_to_pack`      | Add a model to a pack.                                                                                                                                                                  |
| `trigger_rederive` | Queue a re-extraction so parts, derived signals and the search index are rebuilt.                                                                                                       |
| `generate_uvs`     | Unwrap a model with Blender and store the result as a **new, inactive version** - the uploaded file is never touched. Returns a job id; collect it with `get_job_status`.               |
| `bake_textures`    | Bake a model's own appearance and geometry into texture maps with Blender, imported as a texture set bound to it. Returns a job id; collect it with `get_job_status`.                   |
| `analyze_meshes`   | Measure a model with Blender - UV overlap, texel density, exact surface area, watertightness. Changes nothing. Returns a job id; collect it with `get_job_status`.                      |
| `import_model`     | Import a model. Pass a `path` the **server** can read for a co-located import; omit `path` to get an upload ticket plus the HTTP endpoints to stream bytes to when the agent is remote. |

The rest of the library is reachable too, so an agent can build a scene that has
materials and audio and not only meshes. Each takes a path the **server** can read:

| Tool                     | What it does                                                                                                                                                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `import_sound`           | Import a sound. Duration and waveform peaks are measured by the asset processor afterwards, so you do not supply them.                                                                                                                      |
| `import_sprite`          | Import a sprite - `Static`, `SpriteSheet`, `Gif` or `Apng`.                                                                                                                                                                                 |
| `import_environment_map` | Import an HDRI or equirectangular environment map, optionally labelled with its resolution.                                                                                                                                                 |
| `import_texture_set`     | Import a whole material in one call: pass every channel file (albedo, normal, roughness, …) and they land in a single texture set.                                                                                                          |
| `add_texture_channel`    | Add one more channel file to an existing texture set.                                                                                                                                                                                       |
| `bind_texture_set`       | Bind a texture set to a model so it renders with it - associates the set with every version of the model and makes it the default. One call for what the UI does in two.                                                                    |
| `create_material`        | Create a material from parameters alone - no files, no channels, no unwrap. `baseColorHex` plus `roughness` covers most of what a scene needs; this is the cheapest write there is and the only thing that can dress an untextured library. |
| `update_material`        | Change a material's parameters. Omitted fields are left alone.                                                                                                                                                                              |
| `request_upload_ticket`  | For an agent that is **not** on the server: a single-use ticket plus the exact endpoint and field names for uploading any asset family over HTTP. Pass `textureSetId` to add one more channel to a material you already created.            |

Three rules make these safe to retry, review and undo:

- **Every write takes an `idempotencyKey`.** The key is claimed before anything is
  applied, and the claim records whether the write actually landed. Repeating a call
  therefore gets one of three honest answers: `already-applied` (it completed - here is
  the recorded result), `in-progress` (another call holds the key right now; nothing has
  been applied yet, retry), or the write simply runs, because the previous attempt
  failed or its caller died. A crashed import run can be restarted without either
  double-applying a write or losing one to a key that was burned by a failure.
- **Every write is audited.** Modelibr records the operation, target, payload and - when
  tokens are configured - which agent identity performed it, so "what did the agent
  change?" stays answerable.
- **Every write can be undone.** Pass the same `batchId` to a run of related calls and
  `reverse_operation` puts the whole batch back in one call. See below.

### Composing scenes

A scene places library assets into a composition - transformed, lit and dressed with
materials. The server answers every write with the placed node's world footprint, anything
it now overlaps, any scale warning it triggered, and the `validate_scene` findings that
name the node it just touched - so an agent finds out that the lamp post is inside the
wall, or that the "rug" it placed is a twelve-part test scene with two lights in it, on
the call that put it there rather than at the end of the build.

| Tool                    | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create_scene`          | Create a scene, empty or from a full document.                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `place_asset`           | Place one asset. `groundSnap` rests its base on the floor using the asset's measured origin - use it rather than guessing a Y, or a centered-origin asset lands buried to its middle. `on` rests it on another node instead, and `faceToward` aims it at a point.                                                                                                                                                                                                                                                    |
| `distribute_assets`     | Place several copies evenly along a line, in one write - a row of street lamps, a fence, a colonnade. Spacing is computed server-side, and undo removes the whole row.                                                                                                                                                                                                                                                                                                                                               |
| `move_asset`            | Move, rotate or rescale one node; omitted components are left alone, and so are the placement rules the node carries.                                                                                                                                                                                                                                                                                                                                                                                                |
| `remove_asset`          | Remove a node. The whole node is returned, so the removal can be reversed. Refused while other nodes rest on it.                                                                                                                                                                                                                                                                                                                                                                                                     |
| `set_light`             | Add, update or remove one light by id. Upsert semantics, so a retried call does not stack a second sun into the scene.                                                                                                                                                                                                                                                                                                                                                                                               |
| `apply_material`        | Dress one node, for this scene only - the model's own default material is untouched. Takes a `materialId` (a parameter material, from `list_materials`) or a `textureSetId` (a tiling one), and an optional `slot` to dress one of the model's material slots ("cushions") rather than the whole node - `get_asset` lists them as `materialSlots`. Ids and slot names are resolved before the write, so a material that does not exist or a misspelled slot is refused rather than saved and silently rendered grey. |
| `set_scene_stage`       | Declare how far the scene has been taken - `layout`, `detail`, `lit`, `dressed`. Moving forward is refused over a composition that does not hold; moving back always works.                                                                                                                                                                                                                                                                                                                                          |
| `update_scene_document` | Replace the whole document, for bulk edits. An invalid document is rejected in full, never partially applied.                                                                                                                                                                                                                                                                                                                                                                                                        |

#### Composition first, colour last

A scene carries a **stage**: `layout` (room shell and the large forms), `detail` (props,
and things resting on other things), `lit`, then `dressed` (colour and materials). It is
the order in which a scene is worth building - appearance tuned over a layout that is
about to move is made twice, and an object floating half its height is glaring among grey
volumes and easy to miss in a lit, textured render. The editor's viewport has a **blockout
view** for exactly this, drawing every node as the volume it occupies; it is on by default
while a scene is at `layout`.

The stage is enforced rather than advised, in two directions:

- **It decides which findings count.** Until a scene reaches `lit`, "this scene has no key
  light" is reported as a note; until `dressed`, so is "this node has no material". They
  are demoted, never hidden - a check that goes silent is indistinguishable from a check
  that passed - and `coverage.limitations` says which stage the verdict was measured
  against. A scene that declares no stage is judged against everything at once, exactly as
  before stages existed.
- **Moving forward is refused while something is standing on nothing.** That is the one
  finding a write cannot repair on its own, and it is the one that shipped a living room
  full of floating furniture. Answer it with `groundSnap`, with `on`, or - for a pendant
  lamp or a hanging sign - with `suspended=true`, which is a standing fact about the node
  rather than a way past one call. Geometry below the floor comes back on the response
  instead of blocking, because nothing in a document can declare a sunken bath deliberate.

Moving **back** a stage is never refused. It is how a scene is reopened to fix exactly
what the gate stopped.

#### Dressing a node by hand

The scene editor's property panel dresses the selected node too, so `apply_material` is
not the only way in. The panel lists the node's **default binding** — which dresses every
slot no override names — and a row per material slot the model declares, and it picks from
one merged list of **PBR materials and Global Materials** together: filling a slot is the
one place the mechanism does not matter, and a material that needs UVs says so on its
entry. A binding made here is scene-local, undoes with the rest of the editor's history,
and reaches the server on the next save as the same document an agent would have written.

##### Unwrapping a model that has no UVs

A tiling texture set samples a UV layout, so binding one to a model that has none shows
nothing. `validate_scene` reports those nodes and `search_assets` carries the same flag, so
the situation is visible before anything is bound.

There are two ways out, and the cheaper one is usually right:

- **Apply a parameter material.** A colour and a roughness need no UVs and no unwrap. For
  the grey kit assets that make up most untextured libraries, this is the whole answer.
- **`generate_uvs`.** Runs Blender on the model and writes the unwrapped result as a **new
  version**, which is deliberately **not made active**: an unwrap is a proposal, and
  promoting it would change what every scene referencing that model renders before anyone
  had looked at it. Review the version in the app and set it active to adopt it.

```
generate_uvs(modelId: 812, idempotencyKey: "unwrap-812-1")
  -> { status: "queued", jobId: 91 }

get_job_status(jobId: 91, waitSeconds: 120)
  -> { status: "Done", result: { versionId: 1904, meshesUnwrapped: 7, uvChannelIndices: [0] } }
```

`method` defaults to `smart`, which cuts islands wherever faces turn sharply and is what a
model with no authored seams needs. `angle` follows seams the author marked - on a mesh
without any it produces one stretched island, and the job says so in its warning rather
than reporting a clean success. Pass `lightmap: true` to write a second UV channel instead
of replacing the first.

The output is always a `.glb`, whatever went in. UV channels cross into glTF **by
position**, not by name, which is why the result reports `uvChannelIndices` - the Blender
channel name does not survive the export.

Blender is an optional install. Without it the tool answers immediately saying so, rather
than queueing work nothing can run.

##### Baking a model its own textures

`bake_textures` renders a model's own appearance and geometry into image maps - `diffuse`,
`ao`, `normal`, `roughness`, `emissive`, or `combined` - and imports them as one texture set
bound to the version they were baked from. It does **not** become the model's default set;
`bind_texture_set` is the separate, deliberate step that changes what renders.

The `unwrap` flag decides which of two operations you get.

**Left off**, the maps are baked for the UV layout the model already has. Nothing about the
model changes. This is what you want when the layout is a real per-model unwrap and you are
adding detail it does not have yet - ambient occlusion, most often.

```
bake_textures(modelId: 812, idempotencyKey: "bake-812-1", maps: ["ao"])
  -> { status: "queued", jobId: 96 }

get_job_status(jobId: 96, waitSeconds: 120)
  -> { status: "Done", result: { textureSetId: 341, boundToVersionId: 1904, maps: [...] } }
```

**Turned on**, a fresh non-overlapping layout is generated, the model's current appearance is
baked onto it, and a **new, inactive version** is written around the result. This is the
answer for an atlas-packed model - `search_assets(uvStatus: "atlas_packed")` finds them.
Those assets share one palette texture across hundreds of models, so each uses a few percent
of the UV square; maps baked for that layout would be almost entirely empty, and editing one
would mean editing every model on the sheet.

The two UV layers do different jobs during that bake, which is what makes the transfer
possible: the source material keeps sampling the layout it was authored for, while the bake
writes into the new one.

```
bake_textures(modelId: 812, idempotencyKey: "bake-812-2",
              maps: ["diffuse", "ao"], unwrap: true, resolution: 1024)
```

Turning `unwrap` on **requires a colour map** (`diffuse` or `combined`). The new layout
invalidates every texture the model's material sampled, so without one the operation would
report success and hand back a grey model. The new version's material is rebuilt around the
baked maps and carries them inside the `.glb`, so it renders on its own - and so its
generated thumbnail is right too.

Two limits worth knowing. Cycles has no metallic bake pass, so a re-layout bake reports a
warning and renders a metal surface as non-metal. And `resolution` is capped at 4096: a
4K bake on heavy geometry can exhaust the asset processor, which shows up as the container
dying rather than the job failing.

##### Measuring a model before trusting it

`analyze_meshes` runs a geometry pass and changes nothing. It answers four questions no
bounding box can:

- **UV overlap** - what fraction of the layout sits under another face, and so whether the
  model can be baked onto at all. Overlapping islands each overwrite the other.
- **Texel density** - UV area per square metre of real surface, and what that comes to in
  pixels per metre at 512 / 1024 / 2048 / 4096. Two assets in one scene at very different
  densities is what reads as "one of these looks cheap".
- **Surface area** - exact, world-space, with the object's scale applied.
- **Manifold** - watertight and consistently wound, or how many edges are not.

```
analyze_meshes(modelId: 812, idempotencyKey: "measure-812-1")
  -> { status: "queued", jobId: 104 }

get_job_status(jobId: 104, waitSeconds: 120)
  -> { status: "Done", result: { parts: [ { object: "Body",
         uvOverlap: { overlappingFraction: 0.0, bakeable: true },
         texelDensity: { pixelsPerMetre: { "1024": 123.57 } },
         surfaceArea: 12.166688, manifold: { isManifold: false, boundaryEdges: 480 } } ] } }
```

**Two of those four are cached and two are not, and the split is not arbitrary.** The
compute cache is keyed by _geometry hash_ - a hash that deliberately ignores UVs, so that
every copy of the same mesh shares one answer. Surface area and manifoldness are functions
of the geometry alone, so they go in it and `compute_on_demand` can answer them for any
asset with that hash.

UV overlap and texel density are not. A model and the version re-baked from it have
**identical geometry, identical hashes and completely different UV layouts** - so a cached
UV metric would be handed to a mesh it was never measured on. Those two come back on the
job instead, tied to the version actually measured, and `compute_on_demand` says so rather
than answering `pending` forever.

### Placement rules stick to the node

Three of these are properties of the node rather than arguments to one call, because "it
stands on the floor", "it sits on the coffee table" and "it faces the TV" are standing facts
about a composition, not one-off nudges:

- **`groundSnap`** keeps the base on y=0. A later `move_asset` that supplies a position
  without restating it keeps the node on the floor; pass `groundSnap=false` to release it.
- **`on`** rests the node on another node's top face and keeps it there, so moving the
  furniture underneath carries everything standing on it - and swapping it does not mean
  recomputing a stacked Y by hand. `align` decides where it starts: `center` on the middle of
  the top face, `keep` over wherever it already is. `detachAnchor=true` releases it, in place.
- **`faceToward`** turns the node about Y towards a world point and keeps it aimed there, so
  moving the TV re-aims the furniture. `frontAxis` says which local axis is the asset's front
  (`+Z` is assumed - nothing in the library derives it). Setting an explicit `rotationEuler`
  stops the node tracking anything.
- **`suspended`** is the third answer to "what holds this up", beside the floor and an
  anchor: this node hangs, and nothing is expected to be under it. It contradicts the other
  two, and a document that claims both is rejected rather than quietly resolved.

Every scene write accepts an optional `expectedRevision` and is refused if the scene has
moved on since the agent last read it. Leaving it out means "apply to whatever is there" -
but not "apply unconditionally": a write that races another one is still refused rather
than silently overwriting the edit that landed first.

### Undo, and deleting

| Tool                | What it does                                                                                                                                                     |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reverse_operation` | Undo one write by its `idempotencyKey`, or a whole `batchId`, newest first. Restores replaced tags, categories and materials; recycles assets an agent imported. |
| `delete_asset`      | Recycle a model, sound, sprite, environment map or texture set - a **soft** delete, restorable from the recycle bin.                                             |
| `restore_asset`     | Bring a recycled asset back.                                                                                                                                     |

`reverse_operation` and `delete_asset` **default to a dry run**: they report exactly what
would happen and change nothing until you pass `dryRun=false`. Anything that deletes also
needs `MCP_DESTRUCTIVE_ENABLED=true` on the server, and the `destructive` scope if you use
tokens.

Undo is honest about its limits. A write whose prior state was never recorded, or an
operation with no meaningful inverse (re-derivation computes fresh data - there is nothing
lost to restore), is reported as un-reversible rather than being counted as undone.

### Uploading from an agent that is not on the server

When the agent and the server are on different machines, the agent cannot hand a tool a
path the server can read. Call `import_model` without a `path` (or
`request_upload_ticket` for any other family) and you get a **single-use upload ticket**
plus the endpoint and its exact field names. Send the ticket back as the
`X-Modelibr-Upload-Ticket` header on the upload, and that upload is audited and
de-duplicated under your `idempotencyKey` just like a co-located import - a retry of an
upload that already landed is answered `already-applied` instead of importing a second
copy. Tickets expire after 30 minutes; an upload the server rejects hands the ticket back
so you can fix the request and retry.

A ticket is bound to the asset family it was issued for. Presenting a `Sound` ticket at a
model endpoint is refused rather than recorded, because an audit entry that names the wrong
family is one whose undo would delete an unrelated asset.

A material is several files, so it takes several tickets: ask for a `TextureSet` ticket to
create the set with its first channel, then ask again with that set's `textureSetId` (and a
fresh `idempotencyKey`) for each remaining channel. Each channel upload is audited on its
own, and adding a channel over one that is already there records what it displaced, so
undoing it puts the original map back rather than leaving the set a map short.

The server also publishes two **prompts** - guided playbooks an agent can invoke by name:

- **`import_library`** - ingesting a whole folder of models into a categorized pack
  (dedupe, prefer `.glb`, handle multi-file `.gltf`, then categorize from the suggestions).
- **`compose_scene`** - building a scene in stages: block out the room and its large
  furniture, verify, add detail, verify again, light it, and only then dress it with
  materials. The stages themselves are enforced by `set_scene_stage`; the prompt covers the
  judgement calls the tools cannot, such as never scaling from a search hit's dimensions and
  never treating a clean validation as a finished scene.

## Connecting an agent

The server is enabled by default and hosted in-process by the Modelibr Web API
over HTTP (SSE) at the `/mcp` path. With the default configuration that is:

```
https://localhost:8443/mcp
```

(`8443` is `HTTPS_PORT` from your root `.env` - use whatever port you publish the
Web API on.)

Point your agent at that URL. For Claude Code, add it as an SSE MCP server:

```bash
claude mcp add --transport sse modelibr https://localhost:8443/mcp
```

Other clients (Claude desktop, IDE extensions) take the same URL in their MCP
server settings. Once connected, the tools above appear to the agent.

## Configuration

| Setting                   | Default | Effect                                                                                                                    |
| ------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------- |
| `MCP_ENABLED`             | `true`  | Set to `false` in your root `.env` to disable the MCP endpoint entirely.                                                  |
| `MCP_WRITE_ENABLED`       | `false` | Set to `true` to also expose the write tools and the `import_library` / `compose_scene` prompts. Restart the Web API.     |
| `MCP_DESTRUCTIVE_ENABLED` | `false` | Set to `true` to let the agent delete (recycle) assets and reverse writes that deleting undoes. Dry runs work either way. |
| `MCP_TOKENS`              | (unset) | Per-token access scoping - see below. Unset means the endpoint is unauthenticated, as the rest of Modelibr is.            |

The MCP endpoint shares the Web API's network exposure - enabling it does **not**
widen what is reachable from off your machine. Keep the Web API bound to localhost
(or behind your existing reverse proxy) if you do not want other devices on your
network to reach it.

### Scoping what a token may do

Modelibr has no user accounts by design, and `MCP_TOKENS` does not add any. It is a
capability gate on the agent surface alone: without it, any client that can reach the
endpoint can use every tool the endpoint exposes. Configure it before letting anything
beyond your own machine reach `/mcp`.

```bash
MCP_TOKENS=curator:read,write:GENERATE_A_LONG_RANDOM_SECRET;janitor:read,write,destructive:ANOTHER_SECRET
```

Each entry is `name:scopes:secret`, separated by `;`. Scopes are `read` (search and
read assets), `write` (import, tag, categorize, pack, bind) and `destructive` (delete,
and undoing a write that deleting undoes). `write` implies `read`.

Once any token is configured, a caller must present one - as
`Authorization: Bearer <secret>`, or as an `X-Modelibr-Mcp-Token` header for clients that
cannot set `Authorization`. The token's **name** is recorded on everything it writes, so
the audit log answers "which agent did this?" and not only "an agent did this". Secrets
are held hashed and compared in constant time; a malformed `MCP_TOKENS` fails startup
rather than silently leaving the endpoint open. Revoke a token by removing its entry and
restarting the Web API.

## Notes

- Uploaded script assets are treated as **data**, never executed. The agent reads
  parsed metadata (language, detected engine, flagged sensitive APIs), not runnable
  code.
- Every agent query is recorded in Modelibr's search log, the same as searches
  from the app, so "did the agent find good assets?" stays answerable.
