@depends-on:setup,create-texture-sets
Feature: Preview Texture Sets
  Tests that selecting different texture sets updates the 3D model
  immediately in the viewer without needing to set them as default.

  Background:
    Given the following models exist in shared state:
      | name                 |
      | single-version-model |
    And the following texture sets exist in shared state:
      | name        |
      | blue_color  |
      | red_color   |

  @three-js @preview
  Scenario: Switching between texture sets updates the 3D model
    # Ensure ID is in URL for linking steps
    Given I am on the model viewer page for "single-version-model"
    And I link texture set "blue_color" to the model
    And I link texture set "red_color" to the model
    
    # Go to viewer and set blue as default
    Given I am on the model list page
    And I am on the model viewer page for "single-version-model"
    When I set "blue_color" as the default texture set for the current version
    Then "blue_color" should be marked as default in the texture set selector
    And the model should have textures applied in the 3D scene
    
    # Capture current texture state (UUID)
    When I capture the current texture state
    When I close the viewer tab "Texture Sets"
    Then I take a screenshot named "1-blue-default"
    
    # Preview red texture (select but don't set default)
    When I select the texture set "red_color"
    Then the model should have textures applied in the 3D scene
    And the applied texture should be different from the captured state
    When I close the viewer tab "Texture Sets"
    Then I take a screenshot named "2-red-preview"
    
    # Preview blue texture again
    When I select the texture set "blue_color"
    Then the applied texture should be different from the previous state
    When I close the viewer tab "Texture Sets"
    Then I take a screenshot named "3-blue-restored"
