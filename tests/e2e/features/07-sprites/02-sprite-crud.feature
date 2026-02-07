@depends-on:sprites-setup @sprites @crud
Feature: Sprite CRUD Operations
  Create, Read, Update, Delete operations for sprites.

  Scenario: Upload a sprite with a custom name
    Given I am on the sprites page
    When I upload a sprite named "unique-sprite-test" from "red_color.png"
    Then the sprite "unique-sprite-test" should be visible in the sprite list
    And I store the sprite "unique-sprite-test" in shared state

  @update
  Scenario: Update sprite name
    Given I am on the sprites page
    And the sprite "crud-test-sprite" exists in shared state
    When I open the sprite "crud-test-sprite" for editing
    And I change the sprite name to "renamed-sprite"
    And I save the sprite changes
    Then the sprite "renamed-sprite" should be visible in the sprite list
    And the sprite "crud-test-sprite" should not be visible
