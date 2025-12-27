@depends-on:setup
Feature: Multi-Tab URL State

  Background:
    Given the following models exist in shared state:
      | name                 |
      | single-version-model |
      | multi-version-model  |

  Scenario: URL state persists after page refresh
    Given I navigate directly to URL with tabs "leftTabs=modelList,textureSets&rightTabs=settings&activeLeft=textureSets"
    When I refresh the page
    Then the URL should contain "leftTabs=modelList,textureSets"
    And the URL should contain "rightTabs=settings"
    And I take a screenshot of the persisted tabs
