@depends-on:setup,create-texture-sets
Feature: Default Texture Set Behavior

  Background:
    Given the following models exist in shared state:
      | name                  |
      | single-version-model  |
    And the following texture sets exist in shared state:
      | name        |
      | blue_color  |

  Scenario: Setting a default texture set for a model version
    Given I am on the model viewer page for "single-version-model"
    When I set "blue_color" as the default texture set for the current version
    Then "blue_color" should be marked as default in the texture set selector
    And the version thumbnail should eventually be "Ready"
    And the texture set selector should be visible

  Scenario: Independent default texture sets for different versions
    Given the following models exist in shared state:
      | name                 |
      | multi-version-model  |
    And the following texture sets exist in shared state:
      | name        |
      | blue_color  |
      | red_color   |
    And I am on the model viewer page for "multi-version-model"
    When I select version 1
    And I set "blue_color" as the default texture set for the current version
    And I select version 2
    And I set "red_color" as the default texture set for version 2
    Then version 2 should have "red_color" as default
    When I select version 1
    Then version 1 should still have "blue_color" as default

