@cross-panel
Feature: Cross-Panel Tab Independence
  Verify that activating a tab in one panel does not affect the active
  tab in the other panel. Left and right panels should maintain
  independent active tab state.

  Scenario: Activating a left panel tab does not change the right panel active tab
    Given I am on the model list page
    When I open the Texture Sets tab in the left panel
    And I open Settings in the right panel
    And I open Sounds in the right panel
    Then the Settings tab should be visible in the right panel
    And the Sounds tab should be visible in the right panel
    # Activate Settings tab on right to confirm it's not the first tab
    When I click the Settings tab in the right panel
    Then the Settings tab should be active in the right panel
    # Now click a left panel tab — right panel should stay on Settings
    When I click the Models tab in the left panel
    Then the Settings tab should still be active in the right panel
    And I take a screenshot named "cross-panel-left-click-no-right-change"

  Scenario: Activating a right panel tab does not change the left panel active tab
    Given I am on the model list page
    When I open the Texture Sets tab in the left panel
    And I open Settings in the right panel
    And I open Sounds in the right panel
    # Activate Texture Sets on left
    When I click the Texture Sets tab in the left panel
    Then the Texture Sets tab should be active in the left panel
    # Click a right panel tab — left should stay on Texture Sets
    When I click the Sounds tab in the right panel
    Then the Texture Sets tab should still be active in the left panel
    And I take a screenshot named "cross-panel-right-click-no-left-change"
