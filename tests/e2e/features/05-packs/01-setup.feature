@setup @packs-setup
Feature: Setup - Create Test Data for Pack Tests

  Scenario: Create test model for pack association tests
    Given I am on the model list page
    When I upload a model "test-cube.glb" and store it as "pack-test-model"
    Then the thumbnail should be generated via SignalR notification
    And the model should be stored in shared state
