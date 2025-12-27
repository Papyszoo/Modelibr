@depends-on:setup @sprites
Feature: Recycled Sprites
  Tests that sprites (images) can be recycled, restored, and permanently deleted.
  Sprites are 2D image assets that can be managed similarly to models and texture sets.

  Background:
    Given I am on the sprites page

  @upload-sprite
  Scenario: Upload a sprite from PNG texture
    # Verify basic sprite upload functionality
    When I upload a sprite from "blue_color.png"
    Then the sprite should be visible in the sprite list
    And I take a screenshot of the sprite list with uploaded sprite

  @recycle-sprite
  Scenario: Recycling a sprite removes it from the sprite list
    # Test that recycling via context menu moves sprite to recycle bin
    Given I upload a sprite "recycle-test-sprite" from "red_color.png"
    And I take a screenshot of the sprite before recycle
    When I recycle the sprite "recycle-test-sprite"
    Then the sprite should not be visible in the sprite list
    And I take a screenshot after sprite deleted

  @sprite-in-recycle-bin
  Scenario: Recycled sprite appears in recycle bin
    # Verify recycled sprites show up in the recycle bin with correct info
    Given I upload a sprite "bin-test-sprite" from "green_color.png"
    When I recycle the sprite "bin-test-sprite"
    And I navigate to the Recycled Files page
    Then I should see the sprite in the recycled sprites section
    And the sprite should have a thumbnail preview
    And I take a screenshot of the recycled sprites section

  @restore-sprite
  Scenario: Restoring a sprite adds it back to the list
    # Test full restore workflow: recycle → verify in bin → restore → verify back
    Given I upload a sprite "restore-test-sprite" from "yellow_color.png"
    When I recycle the sprite "restore-test-sprite"
    And I navigate to the Recycled Files page
    And I take a screenshot of recycle bin with sprite
    And I restore the recycled sprite
    Then the sprite should be removed from the recycle bin
    And I navigate to the sprites page
    Then the sprite "restore-test-sprite" should be visible
    And I take a screenshot of the restored sprite
