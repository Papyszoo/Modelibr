@setup
Feature: Setup - Create Models and Versions for Texture Set Tests

  Scenario: Create model with single version for future tests
    Given I am on the model list page
    When I upload a model "test-cube.glb" and store it as "single-version-model"
    Then the thumbnail should be generated via SignalR notification
    And the model should be stored in shared state

  Scenario: Create model with two versions for independence tests
    Given I am on the model list page
    When I upload a model "test-torus.fbx" and store it as "multi-version-model"
    And I am on the model viewer page for "multi-version-model"
    And I upload a new version "test-cylinder.fbx"
    Then the model should have 2 versions in shared state
    And the version dropdown should be open
