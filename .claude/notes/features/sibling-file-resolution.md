# Sibling-file resolution — how a model reaches the files it references

A model file rarely stands alone. A loose `.gltf` names its `.bin` buffer and its
textures by relative URI; an FBX or an OBJ names its textures the way the artist's
machine had them. None of those strings mean anything to a server that serves files
by numeric id under `/files/<id>`.

## The safety net came first, and it was absolute

`safeLoadingManager` rewrites any URL that is not `/files/<id>`, `data:` or `blob:` to
a 1×1 transparent PNG. That is not paranoia: an FBX-baked path like
`chest_Specular.tga` (or `C:\Assets\chest_Specular` with no extension at all) 400s
against the strictly-typed file route and kills the WebGL context.

Attached unconditionally, it has an absolute consequence that is easy to misread as a
different bug:

- For a loose `.gltf`, the substituted pixel replaces `scene.bin` — **the model loads
  with zero geometry**, not with a missing texture.
- For an FBX, **every texture is a transparent pixel, always**. A blank white floor
  reads as a lighting problem and costs a debugging cycle. Binding a material by hand
  was the only way to give an FBX any colour.

## `createResourceManager` is the answer, and it serves every format

Build one from a `relativePath -> /files/<id>` map (the version's auxiliary files) and
hand it to the loader as `loader.manager`. With no entries it returns the shared safe
manager unchanged, so a packed `.glb`, an `.stl` and a `.3mf` keep exactly their old
behaviour and cost no extra request.

Matching runs in this order, and the order is the design:

1. the exact normalised path;
2. a key that is a suffix of the requested path (`textures/wood.png` beats a bare
   `wood.png`);
3. the file name alone — this is what catches an FBX's absolute Windows path;
4. **last resort**, the file name without its extension. An FBX records
   `chest_Specular.tga` while the pack ships `chest_Specular.png`. Deliberately last,
   and only on an exact stem match, so it can never displace a real path.

Anything still unmatched falls back to the transparent pixel. Nothing here ever
produces a live request against the file route.

## Two halves, and forgetting the second one hides the first

The manager is useless if the map is never fetched. The model viewer decides whether
to ask for a version's auxiliary files at all, and that predicate must list every
format that can reference a sibling — `.gltf`, `.fbx`, `.obj`. It listed only `.gltf`
for a long time, which meant the FBX fix looked applied and did nothing.

## The gate is positive, and it has to be

`useExternalResources` reports `isAwaitingResources` — "the map has not arrived yet" —
rather than "a query is in flight". `useLoader` caches by URL **and caches failures**,
so a loose glTF whose loader starts one tick early against an empty map permanently
caches a load that failed on the missing `.bin`. It opens as a mesh with zero vertices
and never recovers for the life of the page. A negative flag is not good enough: a
query that has not started reports `isLoading: false`.

## What this cannot fix

An asset whose sibling textures were never imported has nothing to resolve. A pack
path-imported as bare `.fbx` files carries no textures at all, and the honest fix is
re-importing it as a `.zip` or through `POST /models/multifile` — which pairs each
file with the URI it is referenced *by*, and is the contract an agent gets wrong on
its first guess.
