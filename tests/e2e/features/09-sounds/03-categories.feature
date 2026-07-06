@depends-on:sounds-setup @sounds @categories
Feature: Sound Categories CRUD Operations
  Create, Rename, Delete operations for sound categories, all driven from the
  category tree's right-click context menu (there is no manager dialog).

  Scenario: Create a new sound category
    Given I am on the sounds page
    When I create a sound category named "Test Sound Category" via the context menu
    Then the sound category "Test Sound Category" should be visible in the category list
    And I store the sound category "Test Sound Category" in shared state

  # Uses its own category (not the create scenario's) — scenarios in this
  # file run fully parallel, and the create scenario's name cleanup would
  # race a rename of the same category.
  @update
  Scenario: Update a sound category name
    Given I am on the sounds page
    And the sound category "Rename Me Sound Category" exists in shared state
    When I rename the sound category "Rename Me Sound Category" to "Renamed Sound Category" via the context menu
    Then the sound category "Renamed Sound Category" should be visible in the category list
    And the sound category "Rename Me Sound Category" should not be visible in the category list

  @subcategory
  Scenario: Create a subcategory under an existing category
    Given I am on the sounds page
    And the sound category "Parent Sound Category" exists in shared state
    When I add a subcategory named "Child Sound Category" under the sound category "Parent Sound Category" via the context menu
    Then the sound category "Child Sound Category" should be visible in the category list

  @delete
  Scenario: Delete a sound category
    Given I am on the sounds page
    When I create a sound category named "Delete Me Sound Category" via the context menu
    And I delete the sound category "Delete Me Sound Category" via the context menu
    Then the sound category "Delete Me Sound Category" should not be visible in the category list

  @delete @branch
  Scenario: Deleting a category branch removes its subcategories and unassigns their sounds
    Given I am on the sounds page
    And the sound category "Branch Parent Category" exists in shared state
    And the sound category "Branch Child Category" exists as a subcategory of "Branch Parent Category"
    And a sound named "e2e-branch-sound" assigned to the category "Branch Child Category" exists
    When I delete the sound category "Branch Parent Category" via the context menu accepting the branch warning
    Then the sound category "Branch Parent Category" should not be visible in the category list
    And the sound category "Branch Child Category" should not be visible in the category list
    And the sound "e2e-branch-sound" should be uncategorized via API
