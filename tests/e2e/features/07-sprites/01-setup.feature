@setup @sprites-setup
Feature: Setup - Create Test Data for Sprite CRUD Tests
  This setup feature creates test assets needed for sprite CRUD testing.

  Scenario: Create test sprites for CRUD tests
    Given I am on the sprites page
    When I upload a sprite named "crud-test-sprite" from "blue_color.png"
    Then the sprite "crud-test-sprite" should be visible in the sprite list
    And I store the sprite "crud-test-sprite" in shared state
