@depends-on:setup @search
Feature: Global search palette
  Press Ctrl+K from anywhere to search every asset type by name and open a
  result in a panel, reusing the dock tab system.

  Background:
    Given the following models exist in shared state:
      | name                 |
      | single-version-model |

  Scenario: Find a model with the command palette and open it in a tab
    Given I am on the model list page
    When I open the global search palette
    And I search the palette for "single-version-model"
    And I open the first palette result
    Then there should be exactly 1 model viewer tab visible
