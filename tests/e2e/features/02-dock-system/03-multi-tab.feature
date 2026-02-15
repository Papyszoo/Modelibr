@depends-on:setup
Feature: Multi-Tab Persistence

  Background:
    Given the following models exist in shared state:
      | name                 |
      | single-version-model |
      | multi-version-model  |

  Scenario: Tab state persists after page refresh
    Given I am on the model list page
    When I open the Texture Sets tab in the left panel
    And I open Settings in the right panel
    And I refresh the page
    Then the Texture Sets content should be visible
    And a Settings tab should be visible in the dock bar
    And I take a screenshot of the persisted tabs
