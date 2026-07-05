@setup
Feature: Setup - Create Models and Versions for Texture Set Tests

  # This setup runs on GitHub's GPU-less PR runners, so it must NOT block on
  # real asset-processor renders (repeated 4-minute thumbnail timeouts killed
  # PR runs in July 2026). It only creates the models + shared state that
  # dependent scenarios need. Thumbnail-render assertions live on the local
  # GPU lane: 01-model-viewer/03-model-card-thumbnail.feature (@serial) and
  # 01-model-viewer/02-version-switching.feature (@slow).

  Scenario: Create model with single version for future tests
    Given I am on the model list page
    When I upload a model "test-cube.glb" and store it as "single-version-model"
    Then the model should be stored in shared state

  @timeout:720000
  Scenario: Create model with two versions for independence tests
    Given I am on the model list page
    When I upload a model "test-cube.glb" and store it as "multi-version-model"
    And I am on the model viewer page for "multi-version-model"
    And I upload a new version "test-cube.glb"
    Then the model should have 2 versions in shared state
    And the version dropdown should be open

