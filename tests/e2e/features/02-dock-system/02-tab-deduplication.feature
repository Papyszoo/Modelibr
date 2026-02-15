@depends-on:setup
Feature: Tab Deduplication

  Background:
    Given the following models exist in shared state:
      | name                 |
      | single-version-model |
      | multi-version-model  |

  Scenario: Opening the same model twice should not create a duplicate tab
    Given I am on the model list page
    When I click on the model "single-version-model" to open it
    And I go back to the model list
    And I click on the model "single-version-model" to open it again
    Then there should be exactly 1 model viewer tab visible

  Scenario: Opening the same tab type twice via menu should not create a duplicate
    Given I am on the model list page
    When I open the Texture Sets tab in the left panel
    And I open the Texture Sets tab in the left panel
    Then there should be exactly 1 Texture Sets tab visible

