@setup @scenes-setup
Feature: Setup - Create Test Data for Scene Tests

  Scenario: Create a test model for scene placement
    Given I am on the model list page
    When I upload a model "test-cube.glb" and store it as "scene-test-model"
    Then the model should be stored in shared state
