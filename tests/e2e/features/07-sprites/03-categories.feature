@depends-on:sprites-setup @sprites @categories @serial
Feature: Sprite Categories CRUD Operations
  Create, Rename, Delete operations for sprite categories, all driven from the
  category tree's right-click context menu (there is no manager dialog).

  Scenario: Create a new sprite category
    Given I am on the sprites page
    When I create a category named "Test Category" via the context menu
    Then the category "Test Category" should be visible in the category list
    And I store the category "Test Category" in shared state

  @update
  Scenario: Update a category name
    Given I am on the sprites page
    And the category "Test Category" exists in shared state
    When I rename the category "Test Category" to "Updated Category" via the context menu
    Then the category "Updated Category" should be visible in the category list
    And the category "Test Category" should not be visible in the category list

  @delete
  Scenario: Delete a category
    Given I am on the sprites page
    When I create a category named "Delete Me Category" via the context menu
    And I delete the category "Delete Me Category" via the context menu
    Then the category "Delete Me Category" should not be visible in the category list

  @assign
  Scenario: Assign sprite to category
    Given I create a test sprite category named "Assign Test Category" via API
    And I am on the sprites page
    When I upload a sprite with unique name "assign-test-sprite" from "pink_color.png"
    When I open the sprite "assign-test-sprite" for editing
    And I assign the sprite to category "Assign Test Category"
    And I save the sprite changes
    Then I filter sprites by category "Assign Test Category"
    And the sprite "assign-test-sprite" should be visible in the filtered results
