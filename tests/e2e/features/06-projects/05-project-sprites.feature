@projects @sprites @independent
Feature: Project Sprite Associations
  Add and remove sprites to/from projects.
  This test is independent and creates its own resources.

  Scenario: Add sprite to project
    # Setup: Create a fresh project and sprite, then add via API and verify in UI
    Given I create a test project named "Project Sprite Test" via API
    And I create a test sprite named "proj-sprite-test" via API
    And I add the sprite "proj-sprite-test" to the project "Project Sprite Test" via API
    And I am on the project list page
    
    # Verify: UI shows the sprite in the project
    When I open the project "Project Sprite Test"
    Then the project has at least 1 sprite
    And I take a screenshot of project with sprite

  @remove
  Scenario: Remove sprite from project
    # Setup: Create project with sprite already added
    Given I create a test project named "Project Sprite Remove Test" via API
    And I create a test sprite named "removable-proj-sprite" via API
    And I add the sprite "removable-proj-sprite" to the project "Project Sprite Remove Test" via API
    And I am on the project list page
    
    # Test: Remove sprite via UI
    When I open the project "Project Sprite Remove Test"
    And the project has at least 1 sprite
    When I remove the first sprite from the project
    Then the project sprite count should be 0
    And I take a screenshot of project after sprite removed
