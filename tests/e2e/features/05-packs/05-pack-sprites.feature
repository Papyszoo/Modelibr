@packs @sprites @independent
Feature: Pack Sprite Associations
  Add and remove sprites to/from packs.
  This test is independent and creates its own resources.

  Scenario: Add sprite to pack
    # Setup: Create a fresh pack and sprite, then add via API and verify in UI
    Given I create a test pack named "Pack Sprite Test" via API
    And I create a test sprite named "pack-sprite-test" via API
    And I add the sprite "pack-sprite-test" to the pack "Pack Sprite Test" via API
    And I am on the pack list page
    
    # Verify: UI shows the sprite in the pack
    When I open the pack "Pack Sprite Test"
    Then the pack sprite count should be 1
    And I take a screenshot of pack with sprite

  @remove
  Scenario: Remove sprite from pack
    # Setup: Create pack with sprite already added
    Given I create a test pack named "Pack Sprite Remove Test" via API
    And I create a test sprite named "removable-sprite" via API
    And I add the sprite "removable-sprite" to the pack "Pack Sprite Remove Test" via API
    And I am on the pack list page
    
    # Test: Remove sprite via UI
    When I open the pack "Pack Sprite Remove Test"
    And the pack has at least 1 sprite
    When I remove the first sprite from the pack
    Then the pack sprite count should be 0
    And I take a screenshot of pack after sprite removed
