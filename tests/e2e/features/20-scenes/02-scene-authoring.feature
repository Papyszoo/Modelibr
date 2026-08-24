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

  @scene-progressive
  Scenario: A scene stays interactive and admits one held model resource at a time
    # Downloads being promises is not enough: releasing every parse together still
    # monopolises the main thread. Hold both primary files at the browser boundary so
    # the test can prove the second request does not start until the first node settles.
    Given I have imported 2 multi-file glTF models
    And I am on the scenes page
    And a scene named "Progressive Scene" is open
    And the imported scene model files are held
    When I place every imported multi-file model into the scene
    Then the scene should remain interactive and load the held resources serially
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

  @scene-dressing
  Scenario: Dressing a node with a material persists on the saved document
    # Applying a material to a slot was MCP-only until the editor grew this
    # panel, so nothing covered the app's half of `apply_material`. The picker
    # reads the merged material library on purpose: filling a slot is the one
    # place a texture set and a parameter material are the same kind of answer.
    Given a PBR material named "Scene Slot Material" exists
    And a scene named "Dressed Scene" is open
    And I have placed the test model into the scene
    When I dress the selected node with the material "Scene Slot Material"
    And I save the scene
    And I reopen the scene "Dressed Scene"
    Then the stored scene document should dress the node with "Scene Slot Material"

  @scene-dressing
  Scenario: The dressed material is named on the node's property panel
    # The document stores an id. The panel has to resolve it back to a name, or
    # a scene an agent dressed reads as a row of opaque numbers.
    Given a PBR material named "Named Scene Material" exists
    And a scene named "Panel Dressing Scene" is open
    And I have placed the test model into the scene
    When I dress the selected node with the material "Named Scene Material"
    Then the node's material should read "Named Scene Material"

  @scene-dressing
  Scenario: Clearing a dressed slot removes the binding rather than nulling it
    # A cleared binding has to leave the document as if it had never been set:
    # a null entry fails the document validator on the next save.
    Given a PBR material named "Removable Scene Material" exists
    And a scene named "Undressed Scene" is open
    And I have placed the test model into the scene
    And I have dressed the selected node with the material "Removable Scene Material"
    When I clear the node's material
    And I save the scene
    And I reopen the scene "Undressed Scene"
    Then the stored scene document should dress the node with nothing

  @scene-blockout
  Scenario: A blockout box can be added without any library asset
    Given a scene named "Blockout Scene" is open
    When I add a blockout box
    And I save the scene
    And I reopen the scene "Blockout Scene"
    Then the scene should hold 1 node

  # Linking a scene to a project is one of the few things this editor sends
  # straight to the server, and it MOVES THE SCENE'S REVISION. The draft the
  # editor is holding was opened against the old one and is only reseeded while
  # it is clean, so every other edit has to be serialised against the link or
  # the next save is refused over a conflict the user never made.

  # A note on the reload in each of these: the Background loads the app before
  # the scenario provisions its project through the API, and the projects list
  # is cached for five minutes - so the dropdown would go on offering the list
  # as it was at boot and never show the new project. Creating a project through
  # the UI invalidates that cache; provisioning one behind the app's back cannot,
  # and the reload is the test admitting that rather than the app being wrong.

  @scene-project-link
  Scenario: Linking a scene to a project holds editing, then gives it back
    Given the project "Scene Link Held" exists
    And I reload the app
    And I am on the scenes page
    And a scene named "Linked Scene" is open
    When I link the scene to the project "Scene Link Held"
    Then the scene should belong to the project "Scene Link Held"
    And editing the scene should be allowed again

  @scene-project-link
  Scenario: A scene can still be edited and saved after being linked
    # The half that proves the hold ends properly rather than merely looking
    # like it did: the draft has to be sitting on the revision the link
    # produced, or this save comes back as a conflict.
    Given the project "Scene Link Edited" exists
    And I reload the app
    And I am on the scenes page
    And a scene named "Linked Then Edited Scene" is open
    And I have linked the scene to the project "Scene Link Edited"
    When I place the test model into the scene
    And I save the scene
    And I reopen the scene "Linked Then Edited Scene"
    Then the scene should hold 1 node
    And the scene should belong to the project "Scene Link Edited"

  @scene-project-link
  Scenario: An unsaved draft refuses the link rather than racing it
    # The other direction of the same exclusion. Both are needed: this one stops
    # a link starting under a dirty draft, and the hold above stops an edit
    # starting under a link.
    Given the project "Scene Link Refused" exists
    And I reload the app
    And I am on the scenes page
    And a scene named "Dirty Link Scene" is open
    And I have placed the test model into the scene
    When I open the project brief
    Then linking should be refused while the draft is unsaved
