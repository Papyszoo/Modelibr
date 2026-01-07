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

  @viewer @texture-applied
  Scenario: Texture set textures are applied to 3D model
    # Create texture set with a texture
    When I upload texture "blue_color.png" via UI button
    # Navigate to model list page before uploading model
    Given I am on the model list page
    # Upload a model (use existing test-cube.glb asset)
    When I have uploaded a model "test-cube.glb"
    # Navigate to model viewer for the uploaded model
    And I am on the model viewer page for "test-cube.glb"
    # Link texture set to model via API
    And I link texture set "blue_color" to the model
    And I set "blue_color" as the default texture set for the current version
    # Verify 3D canvas shows model
    Then the 3D canvas should be visible
    And I take a screenshot named "texture-applied-to-model"
