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

  # The metadata panel's category picker reads the SAME query key as the
  # sidebar, so a category created in one is immediately offered by the other
  # without any invalidation wiring of its own. Sharing a key means sharing what
  # is stored under it, and whichever of the two mounted second used to
  # overwrite the other's cached shape - so which one broke depended entirely on
  # the order the user navigated in. Both orders are walked here.

  Scenario: The metadata picker offers the sidebar's categories, sidebar first
    Given I have a model category "mcat-nav-a"
    And I have an uploaded model "nav-order-model"
    And I am on the model list page
    When I filter models by category "mcat-nav-a"
    And I open the metadata panel for model "nav-order-model"
    Then the metadata category picker should offer "mcat-nav-a"

  Scenario: The sidebar still lists its categories after the metadata picker loaded them
    Given I have a model category "mcat-nav-b"
    And I have an uploaded model "nav-order-model-b"
    And I am on the model list page
    When I open the metadata panel for model "nav-order-model-b"
    And the metadata category picker should offer "mcat-nav-b"
    And I am on the model list page
    Then the model category "mcat-nav-b" is visible in the sidebar
