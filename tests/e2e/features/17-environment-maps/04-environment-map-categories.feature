@environment-maps @env-map-categories @serial
Feature: Environment Map Categories
  Environment maps use the same shared category sidebar as other assets:
  inline right-click management (create / rename / delete), right-click
  assignment, and single-select filtering by clicking a category.

  Scenario: Create, rename and delete an environment map category
    Given I am on the environment maps page
    When I create an environment map category "emcat-create" via the context menu
    Then the environment map category "emcat-create" is visible in the sidebar
    When I rename the environment map category "emcat-create" to "emcat-renamed" via the context menu
    Then the environment map category "emcat-renamed" is visible in the sidebar
    And the environment map category "emcat-create" is not visible in the sidebar
    When I delete the environment map category "emcat-renamed" via the context menu
    Then the environment map category "emcat-renamed" is not visible in the sidebar

  Scenario: Assign an environment map to a category and filter by it
    Given I have an environment map category "emcat-assign"
    And I am on the environment maps page
    And I upload an environment map named "cat-env"
    When I assign environment map "cat-env" to category "emcat-assign"
    And I filter environment maps by category "emcat-assign"
    Then environment map "cat-env" is visible in the list
