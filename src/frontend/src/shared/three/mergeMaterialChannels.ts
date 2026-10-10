/**
 * Frontend entry point for the shared "apply a Modelibr material without
 * dropping the model's own detail" rule
 * (`asset-processor/lib/materialChannels.js`) - the same source the worker
 * thumbnail uses. Both material builders (`textureSetMaterial`,
 * `parameterMaterial`) route their mesh assignments through it, so binding a
 * material never discards a glTF map it does not cover or `COLOR_0` vertex
 * colours. `mergeMaterialChannelsPerMesh` is the variant for a material that is
 * built once and shared across meshes (the default '' binding).
 */
export {
  mergeMaterialChannels,
  mergeMaterialChannelsPerMesh,
} from '../../../../asset-processor/lib/materialChannels.js'
