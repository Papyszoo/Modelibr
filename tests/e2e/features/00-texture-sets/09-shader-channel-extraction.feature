@texture-types @channel-extraction @shader
# Feature tests for Three.js viewer shader-based channel extraction
Feature: Shader-based Channel Extraction in 3D Viewer
  Verify that channel-packed textures (ORM) display correctly in the 3D viewer
  with individual channels extracted to their respective material slots.

  Background:
    Given I am on the texture sets page

  @viewer @channel-mapping
  Scenario: ORM packed texture displays with channel extraction
    # Upload texture and create texture set via existing step
    When I upload texture "blue_color.png" via UI button
    # Open the texture set viewer
    And I open the texture set viewer
    # Switch to Files tab to verify channel dropdowns exist
    And I switch to the Files tab
    Then the file should show split channels mode
    # Select Split Channel mode for the file
    When I enable split channel mode for the file
    # Pick correct texture types for each channel (R=AO, G=Roughness, B=Metallic)
    And I set channel "R" to texture type "AO"
    And I set channel "G" to texture type "Roughness"
    And I set channel "B" to texture type "Metallic"
    # Save the changes
    And I save the texture set changes
    # Refresh and verify settings are preserved
    And I refresh the page
    And I switch to the Files tab
    Then the file should have channel "R" set to "AO"
    And the file should have channel "G" set to "Roughness"
    And the file should have channel "B" set to "Metallic"
    And I take a screenshot named "orm-split-channels-configured"

  @viewer @texture-applied
  Scenario: Texture set textures are applied to 3D model
    # Create texture set with ALL possible texture types
    Given I am on the texture sets page
    When I create a complete texture set with all texture types named "complete-texture-set"
    # Navigate to model list page before uploading model
    Given I am on the model list page
    # Upload a model (use existing test-cube.glb asset)
    When I have uploaded a model "test-cube.glb"
    # Navigate to model viewer for the uploaded model
    And I am on the model viewer page for "test-cube.glb"
    # Link texture set to model via API
    And I link texture set "complete-texture-set" to the model
    And I set "complete-texture-set" as the default texture set for the current version
    # Verify 3D canvas shows model
    Then the 3D canvas should be visible
    # Verify ALL texture types are present in Three.js material
    And the model should have "Albedo" texture applied
    And the model should have "Normal" texture applied
    And the model should have "AO" texture applied
    And the model should have "Roughness" texture applied
    And the model should have "Metallic" texture applied
    And the model should have "Emissive" texture applied
    # Verify grayscale extraction works for channel-packed textures
    And grayscale channels should be extracted correctly
    And I take a screenshot named "all-textures-applied-to-model"
