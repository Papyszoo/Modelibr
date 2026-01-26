@depends-on:setup,create-texture-sets
Feature: Default Texture Set Behavior
  Tests default texture set assignment and verification that textures
  are actually applied to 3D models via Three.js scene inspection.

  Background:
    Given the following models exist in shared state:
      | name                  |
      | single-version-model  |
    And the following texture sets exist in shared state:
      | name        |
      | blue_color  |

  @three-js @textures
  Scenario: Setting a default texture set for a model version
    # This test verifies:
    # 1. A texture set can be set as default for a model version
    # 2. The default badge appears in the UI
    # 3. The texture is actually applied to the 3D model (via Three.js inspection)
    Given I am on the model viewer page for "single-version-model"
    When I set "blue_color" as the default texture set for the current version
    Then "blue_color" should be marked as default in the texture set selector
    And the version thumbnail should eventually be "Ready"
    And the texture set selector should be visible
    And the model should have textures applied in the 3D scene

  @version-independence
  Scenario: Independent default texture sets for different versions
    # Verifies that each version can have its own default texture set
    Given the following models exist in shared state:
      | name                 |
      | multi-version-model  |
    And the following texture sets exist in shared state:
      | name        |
      | blue_color  |
      | red_color   |
    And I am on the model viewer page for "multi-version-model"
    When I select version 1
    Then I take a screenshot named "1-version1-no-texture"
    When I set "blue_color" as the default texture set for the current version
    Then the texture set selector should be visible
    And I take a screenshot named "2-version1-blue-texture"
    When I select version 2
    And I set "red_color" as the default texture set for version 2
    Then version 2 should have "red_color" as default
    And the texture set selector should be visible
    And I take a screenshot named "3-version2-red-texture"
    When I select version 1
    Then version 1 should still have "blue_color" as default
    And the texture set selector should be visible
    And I take a screenshot named "4-version1-still-blue"

