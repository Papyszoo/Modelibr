@batch2 @vfx @vfx-ui
Feature: VFX editor UI details
    The VFX editor's other surfaces: the asset picker adds a mesh from the
    library, the live preview draws the effect while it is open, and an
    inspector field edit reaches the stored definition and survives a reopen.

    Scenario: The picker adds a mesh component from the library
        Given a VFX mesh model exists
        And the user has created a VFX effect
        When the user adds a mesh component from the library
        Then the timeline should show a mesh track
        And the stored VFX should hold a mesh component referencing the model

    Scenario: The live preview draws while the effect is open
        Given the user has a VFX effect open in the editor
        When the user adds a particles component
        Then the VFX preview should be drawing

    Scenario: An inspector edit persists to the stored definition
        Given the user has a VFX effect open in the editor
        When the user adds a particles component
        And the user sets the particles "Rate (/s)" to 250
        Then the stored VFX particles rate should be 250
        When the user navigates back to the VFX list and reopens the effect
        Then the particles "Rate (/s)" should read "250"
