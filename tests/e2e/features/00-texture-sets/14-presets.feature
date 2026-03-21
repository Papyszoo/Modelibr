@depends-on:setup,create-texture-sets
Feature: Preset (Variant) Workflow
  Tests the full preset workflow: adding a new preset, linking a texture set
  to it, selecting it for preview, and setting it as main.

  Background:
    Given the following models exist in shared state:
      | name                 |
      | single-version-model |
    And the following texture sets exist in shared state:
      | name        |
      | blue_color  |
      | red_color   |

  @presets @timeout:720000 @serial
  Scenario: Add preset, link texture, set as main
    Given I am on the model viewer page for "single-version-model"
    # Default preset should show Main badge
    Then the current preset should show the "Main" badge

    # Add a new preset called "Damaged"
    When I add a new preset "Damaged"
    Then the preset "Damaged" should be selected

    # New preset persists after switching away and back
    When I select preset "Default"
    Then the preset "Default" should be selected
    When I select preset "Damaged"
    Then the preset "Damaged" should be selected

    # Link red_color texture set to the Damaged preset via UI
    When I link texture set "red_color" to the current preset via UI
    Then the texture set "red_color" should be linked in materials

    # Switch to Default and back to Damaged to verify link persists
    When I select preset "Default"
    And I select preset "Damaged"
    Then the texture set "red_color" should be linked in materials

    # Set Damaged as main
    And I set the current preset as main
    Then the current preset should show the "Main" badge

    # Verify dropdown does not show [object Object] entries
    Then the preset dropdown should not contain invalid entries
