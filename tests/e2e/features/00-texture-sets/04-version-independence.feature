@depends-on:setup,create-texture-sets
Feature: Version Thumbnail Independence

  Background:
    Given the following models exist in shared state:
      | name                 |
      | multi-version-model  |
    And the following texture sets exist in shared state:
      | name       |
      | red_color  |

  Scenario: Version 1 thumbnail remains unchanged when modifying version 2
    Given I am on the model viewer page for "multi-version-model"
    And I have version 1 and version 2
    When I save thumbnail details for version 1 from database
    And I select version 2
    And I link texture set "red_color" to the model
    And I set "red_color" as the default texture set for version 2
    Then thumbnail details for version 1 in database should remain unchanged
    And version 1 should have its original thumbnail in the version strip
    And version 2 should have a new thumbnail in the version strip

