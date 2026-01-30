@depends-on:sounds-setup @sounds @categories
Feature: Sound Categories CRUD Operations
  Create, Read, Update, Delete operations for sound categories.

  Scenario: Create a new sound category
    Given I am on the sounds page
    When I open the sound category management dialog
    And I create a sound category named "Test Sound Category" with description "A test sound category"
    Then the sound category "Test Sound Category" should be visible in the category list
    And I store the sound category "Test Sound Category" in shared state

  @update
  Scenario: Update a sound category name
    Given I am on the sounds page
    And the sound category "Test Sound Category" exists in shared state
    When I open the sound category management dialog
    And I edit the sound category "Test Sound Category"
    And I change the sound category name to "Updated Sound Category"
    And I save the sound category changes
    Then the sound category "Updated Sound Category" should be visible in the category list
    And the sound category "Test Sound Category" should not be visible in the category list

  @delete
  Scenario: Delete a sound category
    Given I am on the sounds page
    When I open the sound category management dialog
    And I create a sound category named "Delete Me Sound Category"
    And I delete the sound category "Delete Me Sound Category"
    Then the sound category "Delete Me Sound Category" should not be visible in the category list
