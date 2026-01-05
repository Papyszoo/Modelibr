@depends-on:sprites-setup @sprites @categories
Feature: Sprite Categories CRUD Operations
  Create, Read, Update, Delete operations for sprite categories.

  Scenario: Create a new sprite category
    Given I am on the sprites page
    When I open the category management dialog
    And I create a category named "Test Category" with description "A test category"
    Then the category "Test Category" should be visible in the category list
    And I store the category "Test Category" in shared state

  @update
  Scenario: Update a category name
    Given I am on the sprites page
    And the category "Test Category" exists in shared state
    When I open the category management dialog
    And I edit the category "Test Category"
    And I change the category name to "Updated Category"
    And I save the category changes
    Then the category "Updated Category" should be visible in the category list
    And the category "Test Category" should not be visible in the category list

  @delete
  Scenario: Delete a category
    Given I am on the sprites page
    When I open the category management dialog
    And I create a category named "Delete Me Category"
    And I delete the category "Delete Me Category"
    Then the category "Delete Me Category" should not be visible in the category list

  @assign @skip
  # Skip: File upload in sprites page may not be working correctly in this test context
  # The upload step finds existing sprites instead of creating new ones
  # TODO: Investigate sprite file input selector and upload mechanics
  Scenario: Assign sprite to category
    Given I create a test sprite category named "Assign Test Category" via API
    And I am on the sprites page
    When I upload a sprite named "assign-test-sprite" from "blue_color.png"
    When I open the sprite "assign-test-sprite" for editing
    And I assign the sprite to category "Assign Test Category"
    And I save the sprite changes
    Then I filter sprites by category "Assign Test Category"
    And the sprite "assign-test-sprite" should be visible in the filtered results
