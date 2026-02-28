@exr-preview
Feature: EXR Texture Preview Loading
  Verify that texture sets containing EXR textures can be previewed
  in the 3D viewer without errors. EXR textures are loaded natively
  using the EXRLoader with proper color space handling.
  Preview tab is only available for Universal (Global Materials) texture sets.

  Scenario: Preview tab renders without errors when texture set contains EXR textures
    Given I am on the texture sets page
    When I create a universal texture set with EXR textures named "exr_preview_test"
    And I switch to the "Global Materials" kind tab
    And I open the texture set viewer for "exr_preview_test"
    And I switch to the Preview tab
    Then the 3D preview canvas should be visible
    And no console errors should be present
    And I take a screenshot named "exr-preview-no-crash"

  Scenario: Preview tab renders with mixed EXR and standard textures
    Given I am on the texture sets page
    When I create a universal texture set with mixed EXR and standard textures named "mixed_exr_test"
    And I switch to the "Global Materials" kind tab
    And I open the texture set viewer for "mixed_exr_test"
    And I switch to the Preview tab
    Then the 3D preview canvas should be visible
    And the 3D preview should have textures applied
    And no console errors should be present
    And I take a screenshot named "mixed-exr-preview"
