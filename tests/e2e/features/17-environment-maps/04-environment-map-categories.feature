@environment-maps @env-map-categories @serial
Feature: Environment Map Categories
  Environment maps use the same shared category system as other assets:
  the redesigned manager dialog (create / edit / delete), right-click
  assignment, and filtering by category.

  Scenario: Create, rename and delete an environment map category
    Given I am on the environment maps page
    When I open the environment map category manager
    And I create the environment map category "emcat-create"
    Then the environment map category "emcat-create" is listed
    When I rename the environment map category "emcat-create" to "emcat-renamed"
    Then the environment map category "emcat-renamed" is listed
    And the environment map category "emcat-create" is not listed
    When I delete the environment map category "emcat-renamed"
    Then the environment map category "emcat-renamed" is not listed

  Scenario: Assign an environment map to a category and filter by it
    Given I have an environment map category "emcat-assign"
    And I am on the environment maps page
    And I upload an environment map named "cat-env"
    When I assign environment map "cat-env" to category "emcat-assign"
    And I filter environment maps by category "emcat-assign"
    Then environment map "cat-env" is visible in the list
