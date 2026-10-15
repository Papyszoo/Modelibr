@batch2 @scenes @scene-ui
Feature: Scene editor UI details
    The scene editor's day-to-day surfaces: the hierarchy selects, renames,
    hides and removes nodes; the property panel reports the placement rules the
    server keeps applying; a node can be dressed with a global texture set as
    well as a parameter material; a light can be added; and the scene render
    view draws a saved scene the same way the editor does.

    Background:
        Given a scene UI model exists
        And I am on the scenes page

    Scenario: The hierarchy selects a node and its rename is saved
        Given a scene named "B2 Hierarchy Scene" is open
        And I have placed the scene UI model in the scene
        When I select the first scene node
        Then the scene properties panel should be visible
        When I rename the selected scene node to "Renamed Lamp"
        And I save the scene
        Then the stored scene document named "B2 Hierarchy Scene" should name its first node "Renamed Lamp"

    Scenario: Removing a node from the hierarchy takes it out of the scene
        Given a scene named "B2 Removal Scene" is open
        And I have placed the scene UI model in the scene
        When I remove the first scene node from the hierarchy
        Then the scene should hold 0 nodes

    Scenario: Hiding a node from the hierarchy is saved
        Given a scene named "B2 Hidden Scene" is open
        And I have placed the scene UI model in the scene
        When I hide the first scene node
        And I save the scene
        And I reopen the scene "B2 Hidden Scene"
        Then the stored scene document named "B2 Hidden Scene" should mark the first node hidden

    Scenario: Adding a light through the editor is saved
        Given a scene named "B2 Lit Scene" is open
        When I add a light from the scene editor
        Then the scene editor should report 1 lights
        When I save the scene
        Then the stored scene document named "B2 Lit Scene" should hold 1 lights

    Scenario: A light's intensity is editable from the inspector
        # The Light button used to add a light nothing could select or edit, so
        # its intensity, colour and aim were reachable only by editing the saved
        # document by hand.
        Given a scene named "B2 Edited Light Scene" is open
        When I add a light from the scene editor
        And I set the selected light's intensity to 2.5
        And I save the scene
        Then the stored scene document named "B2 Edited Light Scene" should hold a light of intensity 2.5

    Scenario: The property panel reports a node held on the ground
        Given a ground-held scene named "B2 Grounded Scene" exists
        When I open the scene named "B2 Grounded Scene" from the list
        And I select the first scene node
        Then the scene properties should report the node rests on the ground

    Scenario: Dressing a node with a texture set persists
        Given a global texture set named "B2 Global Tiles" exists
        And a scene named "B2 Textured Scene" is open
        And I have placed the scene UI model in the scene
        When I dress the selected node with the texture set "B2 Global Tiles"
        Then the node's texture set should read "B2 Global Tiles"
        When I save the scene
        Then the stored scene document named "B2 Textured Scene" should dress the node with the texture set "B2 Global Tiles"

    Scenario: The scene render view draws a saved scene
        Given a renderable scene named "B2 Render Scene" exists
        When I open the scene render view for "B2 Render Scene" from "front"
        Then the scene render view should report every visible node loaded
