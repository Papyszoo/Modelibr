@models @model-categories @serial
Feature: Model Categories CRUD
  Model categories live in a single shared pool. Creating, renaming (editing)
  and deleting must all work from the shared category manager dialog — in
  particular, editing a category must not falsely collide with itself.

  Scenario: Create, rename and delete a model category
    Given I am on the model list page
    When I open the model category manager
    And I create the model category "mcat-create"
    Then the model category "mcat-create" is listed
    When I rename the model category "mcat-create" to "mcat-renamed"
    Then the model category "mcat-renamed" is listed
    And the model category "mcat-create" is not listed
    When I delete the model category "mcat-renamed"
    Then the model category "mcat-renamed" is not listed

  Scenario: Assign a model to a category and filter by it
    Given I have a model category "mcat-assign"
    And I have an uploaded model "cat-model"
    And I am on the model list page
    When I assign model "cat-model" to category "mcat-assign"
    And I filter models by category "mcat-assign"
    Then model "cat-model" is visible in the model grid
