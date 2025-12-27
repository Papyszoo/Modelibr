@depends-on:setup
Feature: Tab Deduplication via URL

  Background:
    Given the following models exist in shared state:
      | name                 |
      | single-version-model |
      | multi-version-model  |

  Scenario: Navigating with duplicate model in URL should deduplicate
    Given I navigate to URL with duplicate tabs for model "single-version-model"
    Then the model should appear only once in leftTabs URL
    
  Scenario: Navigating with same model in both panels should allow it
    Given I navigate to URL with model "single-version-model" in both panels
    Then the URL should contain the model in leftTabs
    And the URL should contain the model in rightTabs
    And the model viewer should be visible in the left panel
    And the model viewer should be visible in the right panel
    And I take a screenshot of the dual panel view

