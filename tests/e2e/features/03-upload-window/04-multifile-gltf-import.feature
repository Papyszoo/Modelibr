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

  # The worker resolving external references does NOT mean the browser can: the two
  # run different loading managers. The in-app viewer used the shared safe manager,
  # which replaces every non-/files/<id> URL with a transparent PNG — so the .gltf's
  # scene.bin was substituted away and the model opened with no geometry at all.
  # Untagged (fast PR lane): it opens the viewer, no worker render needed.
  Scenario: An imported multi-file glTF loads its geometry in the browser viewer
    Given I am on the model list page
    When I import a multi-file glTF folder
    And I open the imported multi-file model in the viewer
    Then the viewer scene should contain the multi-file model's geometry

  # A zip is expanded in the browser and imported exactly like a picked folder, so it
  # goes through the same success callback — the one that associates each imported model
  # with the pack the import was started from. When zip had its own server-side route it
  # answered a different shape, that callback threw, and nothing was ever associated
  # (nor did the grid refresh) after the progress window had reported success.
  # Untagged: no worker render needed.
  Scenario: Importing a zip from inside a pack adds its models to that pack
    Given I am on the model list page
    When I import a multi-file glTF zip from inside a new pack
    Then the imported multi-file model should belong to that pack

  # Full round-trip through the real asset-processor: the worker must resolve the
  # external .bin/.png (LoadingManager URLModifier) to render and extract the mesh,
  # exactly like a packed .glb. @slow because it waits on a real worker render.
  @slow @timeout:300000
  Scenario: A zip-imported multi-file glTF renders and extracts its mesh
    Given I am on the model list page
    When I import a multi-file glTF zip
    Then the imported multi-file model should eventually render
    And the imported multi-file model should have extracted mesh parts
    And the imported multi-file model should be indexed at its real source size
