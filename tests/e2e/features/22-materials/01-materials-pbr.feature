@materials @materials-pbr @batch1
Feature: PBR materials
    A PBR material is parameters rather than images - a colour, a roughness, a
    metallic - and needs no UVs. This covers the page that lists and edits them,
    the tools that create and read them, the merged library that puts a material
    and a texture set in one browse, and dressing a scene node with one.

    Background:

    Scenario: The materials page creates a material and draws its swatch
        When I am on the PBR materials page
        And I create the PBR material "Weathered Brass" with colour "#B5892B"
        Then the PBR material "Weathered Brass" should be listed
        And the PBR material "Weathered Brass" should show a "#B5892B" swatch
        And the API should store the PBR material "Weathered Brass" with colour "#B5892B" and roughness 0.5

    Scenario: Editing a material renames it
        Given a materials PBR material named "Editable Clay" exists
        When I am on the PBR materials page
        And I edit the PBR material "Editable Clay" to "Fired Clay"
        Then the PBR material "Fired Clay" should be listed

    Scenario: An agent creates a material and reads it back
        When an agent creates a PBR material "Agent Matte" with colour "#1A1A1A"
        And an agent reads the created material over MCP
        Then the MCP material should be named "Agent Matte" with colour "#1A1A1A"

    Scenario: An agent updates a material
        When an agent creates a PBR material "Agent Rubber" with colour "#222222"
        And an agent updates the created material to colour "#333333"
        Then the MCP material should now have colour "#333333"

    Scenario: The material library merges parameter materials and texture sets
        When an agent creates a PBR material "Agent Brass" with colour "#B5892B"
        And a universal texture set named "Oak Planks Global" exists
        And an agent lists the material library over MCP
        Then the MCP material library should include "Agent Brass" as a "Material"
        And the MCP material library should include the texture set "Oak Planks Global" as a "GlobalMaterial"

    Scenario: An agent dresses a scene node with a material and reverses it
        Given a scene with a placed materials model exists
        And an agent creates a PBR material "Agent Dressing" with colour "#445566"
        When an agent dresses the placed node with the created material
        Then the scene node should be dressed with the created material
        When an agent reverses that material write
        Then the scene node should have no material binding

    Scenario: An agent binds a universal texture set to a model
        Given a materials model exists
        And a universal texture set named "Agent Tiles" exists
        When an agent binds the universal texture set to the materials model
        Then the model's default texture set should be the universal texture set

    Scenario: Adding a texture channel from an unreadable path is reported
        # add_texture_channel reads a path the SERVER can see. The E2E webapi runs
        # in a container with no shared filesystem, so a successful add cannot be
        # driven here; what can is that an unreadable path is refused, not ignored.
        Given a universal texture set named "Agent Channel Set" exists
        When an agent adds a texture channel from an unreadable path
        Then the agent should be told the path is not readable
