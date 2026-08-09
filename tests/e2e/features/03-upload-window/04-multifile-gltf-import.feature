Feature: Multi-file glTF Import

  A loose .gltf ships its geometry (.bin) and textures as separate sibling files.
  These scenarios guard the folder/zip import UI plus the ModelVersionAuxiliaryFile
  persistence and the worker's external-reference resolver — on the pre-feature code
  the external files were dropped and only self-contained .glb imported.

  # No render wait, so it stays in the fast PR lane: proves the folder picker groups
  # the .gltf with its .bin/.png and the backend persists them as auxiliary files.
  Scenario: Importing a multi-file glTF folder stores its external buffer and texture
    Given I am on the model list page
    When I import a multi-file glTF folder
    Then the imported multi-file model should have its .bin and texture as auxiliary files

  # Full round-trip through the real asset-processor: the worker must resolve the
  # external .bin/.png (LoadingManager URLModifier) to render and extract the mesh,
  # exactly like a packed .glb. @slow because it waits on a real worker render.
  @slow @timeout:300000
  Scenario: A zip-imported multi-file glTF renders and extracts its mesh
    Given I am on the model list page
    When I import a multi-file glTF zip
    Then the imported multi-file model should eventually render
    And the imported multi-file model should have extracted mesh parts
