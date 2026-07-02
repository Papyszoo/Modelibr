@tiff-preview
Feature: TIFF Texture Preview Loading
  Verify that texture sets containing TIFF textures can be previewed
  in the 3D viewer without errors. Browsers cannot decode TIFF natively;
  textures are routed through utif2 and re-wrapped as Three.js textures.

  @serial @timeout:300000
  Scenario: Preview tab renders without errors when texture set contains a TIFF texture
    Given I am on the texture sets page
    When I create a universal texture set with a TIFF texture named "tiff_preview_test"
    And I switch to the "Global Materials" kind tab
    And I open the texture set viewer for "tiff_preview_test"
    And I switch to the Preview tab
    Then the 3D preview canvas should be visible
    And no console errors should be present
    And I take a screenshot named "tiff-preview-no-crash"

  @serial @timeout:300000
  Scenario: Preview tab renders with mixed TIFF and standard textures
    Given I am on the texture sets page
    When I create a universal texture set with mixed TIFF and standard textures named "mixed_tiff_test"
    And I switch to the "Global Materials" kind tab
    And I open the texture set viewer for "mixed_tiff_test"
    And I switch to the Preview tab
    Then the 3D preview canvas should be visible
    And the 3D preview should have textures applied
    And no console errors should be present
    And I take a screenshot named "mixed-tiff-preview"
