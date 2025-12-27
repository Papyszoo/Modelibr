@depends-on:setup
Feature: Tab URL Synchronization

  Background:
    Given the following models exist in shared state:
      | name                 |
      | single-version-model |
      | multi-version-model  |

  Scenario: Model tabs are added to URL when opening
    Given I am on the model list page
    When I click on the model "single-version-model" to open it
    Then the URL should contain "model-"
    And the URL should contain "activeLeft=model-"
    And I take a screenshot of the dock with model tab

  Scenario: URL with duplicate tabs gets deduplicated on load
    Given I navigate directly to URL with duplicate tabs "leftTabs=modelList,textureSets,textureSets,model-1,model-1&activeLeft=model-1"
    Then the URL should not contain duplicate tab IDs
