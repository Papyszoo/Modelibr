@depends-on:setup
Feature: Tab Deduplication via URL

  Background:
    Given the following models exist in shared state:
      | name                 |
      | single-version-model |
      | multi-version-model  |

  Scenario: Navigating with duplicate model in URL should deduplicate
    Given I navigate directly to URL with tabs "leftTabs=modelList,model-1,model-1&activeLeft=model-1"
    Then there should be exactly 1 tab with ID "model-1" in leftTabs
    
  Scenario: Navigating with same model in both panels should allow it
    Given I navigate directly to URL with tabs "leftTabs=modelList&rightTabs=model-1&activeRight=model-1"
    Then the URL should contain "rightTabs=model-1"
    And the model viewer should be visible in the right panel
