@depends-on:setup
Feature: Tab State Management

  Background:
    Given the following models exist in shared state:
      | name                 |
      | single-version-model |
      | multi-version-model  |

  Scenario: Model viewer tab appears when opening a model
    Given I am on the model list page
    When I click on the model "single-version-model" to open it
    Then a model viewer tab should be visible in the dock bar
    And the model viewer should be visible
    And I take a screenshot of the dock with model tab

  Scenario: Opening a tab via the add-tab menu shows the tab content
    Given I am on the model list page
    When I open the Texture Sets tab in the left panel
    Then the Texture Sets content should be visible
    And a Texture Sets tab should be visible in the dock bar
