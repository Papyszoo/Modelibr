@models @model-categories @serial
Feature: Model Categories
  Model categories are managed inline from the category sidebar's right-click
  context menu (the manager dialog was removed). Assigning a model to a
  category and then selecting that category filters the grid to it.

  Scenario: Create, rename and delete a model category
    Given I am on the model list page
    When I create a model category "mcat-create" via the context menu
    Then the model category "mcat-create" is visible in the sidebar
    When I rename the model category "mcat-create" to "mcat-renamed" via the context menu
    Then the model category "mcat-renamed" is visible in the sidebar
    And the model category "mcat-create" is not visible in the sidebar
    When I delete the model category "mcat-renamed" via the context menu
    Then the model category "mcat-renamed" is not visible in the sidebar

  Scenario: Assign a model to a category and filter by it
    Given I have a model category "mcat-assign"
    And I have an uploaded model "cat-model"
    And I am on the model list page
    When I assign model "cat-model" to category "mcat-assign"
    And I filter models by category "mcat-assign"
    Then model "cat-model" is visible in the model grid
