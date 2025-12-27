@depends-on:setup
Feature: Batch Upload Display
  Tests that multiple file uploads are grouped as batches and displayed correctly
  in the upload progress window.

  Background:
    Given I am on the model list page

  @batch-grouping
  Scenario: Multiple file upload shows as batch group
    When I upload multiple 3D models:
      | filename       |
      | test-cube.glb  |
      | test-torus.fbx |
    Then the upload progress window should be visible
    And I should see a batch group in the upload window
    And the batch header should show "2 files"
    And all files should be listed in the batch
    And I take a screenshot of the batch upload

  @batch-progress
  Scenario: Batch shows combined progress and status
    When I upload multiple 3D models:
      | filename       |
      | test-cube.glb        |
      | test-torus.fbx |
    Then the batch should show uploading status
    When all uploads complete
    Then the batch status should show "2 completed"

  @batch-collapse
  Scenario: Batch can be collapsed and expanded
    When I upload multiple 3D models:
      | filename       |
      | test-cube.glb        |
      | test-torus.fbx |
    And all uploads complete
    Then the batch items should be visible by default
    When I collapse the batch
    Then the batch items should be hidden
    When I expand the batch
    Then the batch items should be visible

  @batch-open-individual
  Scenario: Individual files in batch can be opened in tab
    When I upload multiple 3D models:
      | filename       |
      | test-cube.glb        |
      | test-torus.fbx |
    And all uploads complete
    When I click the "Open in Tab" button for "test-cube.glb" in the batch
    Then a model viewer tab should be opened in the URL
