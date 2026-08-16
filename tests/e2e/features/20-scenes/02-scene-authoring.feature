@depends-on:scenes-setup @scenes
Feature: Scene authoring
  A scene composes library assets in 3D space. These cover the flow the feature
  exists for: create a scene, place a library asset into it, move it, save, and
  reopen it with the placement still there and still pinned to the version it
  was placed from.

  Background:
    Given the following models exist in shared state:
      | name              |
      | scene-test-model  |
    And I am on the scenes page

  @scene-create
  Scenario: Creating a scene opens its editor
    When I create a scene named "Empty Scene"
    Then the scene editor should be visible
    And the scene should hold no nodes

  @scene-place
  Scenario: Placing a library model adds a node pinned to its version
    Given a scene named "Placement Scene" is open
    When I place the test model into the scene
    Then the scene should hold 1 node
    And the placed node should reference the test model's active version

  @scene-persist
  Scenario: A placed asset survives saving and reopening the scene
    Given a scene named "Persisted Scene" is open
    And I have placed the test model into the scene
    When I save the scene
    And I reopen the scene "Persisted Scene"
    Then the scene should hold 1 node
    And the placed node should reference the test model's active version

  @scene-move
  Scenario: Moving a node from the property panel persists
    Given a scene named "Moved Scene" is open
    And I have placed the test model into the scene
    When I set the selected node's position x to 7.5
    And I save the scene
    And I reopen the scene "Moved Scene"
    Then the stored scene document should place the node at x 7.5

  @scene-undo
  Scenario: Undo removes a placement before it is saved
    Given a scene named "Undone Scene" is open
    And I have placed the test model into the scene
    When I undo the last edit
    Then the scene should hold no nodes

  @scene-multifile
  Scenario: A multi-file glTF loads its external buffer in the scene viewport
    # A loose .gltf references its .bin and textures by relative URI. Those
    # resolve against the version-file route and 404 unless the viewport maps
    # them to the auxiliary files the import stored - and a missing .bin means
    # no geometry, which surfaced as a hard loader error in the console.
    Given I have imported a multi-file glTF model
    # Importing happens on the model list, so come back before authoring.
    And I am on the scenes page
    And a scene named "Multifile Scene" is open
    When I place every imported multi-file model into the scene
    Then the scene viewport should have fetched the model's auxiliary files
    And no node should be flagged as failed to load

  @scene-multifile
  Scenario: Several loose glTF assets in one scene all resolve their buffers
    # A single-node scene cannot catch this, which is why the scenario above
    # passed while real scenes showed red boxes. Each loose .gltf must wait for
    # its own resource map, and the gate that held the loader back keyed off
    # "not loading" rather than "has arrived" - a query that has not started
    # yet also reports "not loading". With more than one asset in flight some
    # nodes started against an empty map, read a bufferView past the end of the
    # placeholder the loading manager substitutes, and stayed failed for the
    # life of the page because useLoader caches failures by URL.
    Given I have imported 2 multi-file glTF models
    And I am on the scenes page
    And a scene named "Multifile Crowd Scene" is open
    When I place every imported multi-file model into the scene
    Then the scene viewport should have fetched a file for every placed model
    And no node should be flagged as failed to load

  @scene-tab-switch
  Scenario: An unsaved scene survives a trip to another tab
    # The dock renders only the ACTIVE tab, so switching away unmounts the
    # editor. With the open scene held in component state, coming back landed
    # on the scene list with the unsaved placement gone - silent data loss on
    # the most ordinary interaction there is.
    Given a scene named "Interrupted Scene" is open
    And I have placed the test model into the scene
    When I switch to the models tab and back to scenes
    Then the scene editor should be visible
    And the scene should hold 1 node
    And the scene should have unsaved changes

  @scene-blockout
  Scenario: A blockout box can be added without any library asset
    Given a scene named "Blockout Scene" is open
    When I add a blockout box
    And I save the scene
    And I reopen the scene "Blockout Scene"
    Then the scene should hold 1 node
