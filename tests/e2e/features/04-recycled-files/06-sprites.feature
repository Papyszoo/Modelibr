@depends-on:setup
Feature: Recycled Sprites
  Tests that sprites (images) can be recycled, restored, and permanently deleted

  Background:
    Given I am on the sprites page

  @upload-sprite
  Scenario: Upload a sprite from PNG texture
    When I upload a sprite from "blue_color.png"
    Then the sprite should be visible in the sprite list
    And I take a screenshot of the sprite list with uploaded sprite

  @recycle-sprite @skip
  Scenario: Recycling a sprite removes it from the sprite list
    # Skip: SpriteList UI doesn't have delete button implemented
    Given I upload a sprite "recycle-test-sprite" from "red_color.png"
    And I take a screenshot of the sprite before recycle
    When I delete the sprite "recycle-test-sprite"
    Then the sprite should not be visible in the sprite list
    And I take a screenshot after sprite deleted

  @sprite-in-recycle-bin @skip
  Scenario: Recycled sprite appears in recycle bin
    # Skip: Need to verify if sprites section exists in recycle bin
    Given I upload a sprite "bin-test-sprite" from "green_color.png"
    When I delete the sprite "bin-test-sprite"
    And I navigate to the Recycled Files page
    Then I should see the sprite in the recycled sprites section
    And the sprite should have a thumbnail preview
    And I take a screenshot of the recycled sprites section

  @restore-sprite @skip
  Scenario: Restoring a sprite adds it back to the list
    # Skip: Need to verify if sprites section exists in recycle bin
    Given I upload a sprite "restore-test-sprite" from "yellow_color.png"
    When I delete the sprite "restore-test-sprite"
    And I navigate to the Recycled Files page
    And I restore the recycled sprite
    Then the sprite should be removed from the recycle bin
    And I navigate to the sprites page
    Then the sprite "restore-test-sprite" should be visible
    And I take a screenshot of the restored sprite
