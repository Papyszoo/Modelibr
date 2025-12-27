@depends-on:setup
Feature: Upload Progress Window
  Tests that the upload progress window displays correctly during file uploads
  and that the "Open in Tab" button navigates correctly.

  Background:
    Given I am on the model list page

  @upload-display
  Scenario: Single model upload shows progress and completion
    When I upload model file "test-cube.glb"
    Then the upload progress window should be visible
    And I should see the filename "test-cube.glb" in the upload window
    And I should see the extension "GLB" displayed
    And the upload should complete successfully
    And I take a screenshot of the upload completed state
    And the "Open in Tab" button should be visible for "test-cube.glb"

  @open-in-tab
  Scenario: Open in Tab button opens model viewer
    When I upload model file "test-cube.glb"
    And the upload completes successfully
    When I click the "Open in Tab" button for "test-cube.glb"
    Then a model viewer tab should be opened in the URL
    And the model viewer should be visible
    And I take a screenshot of the model viewer from upload

  @tab-activation
  Scenario: Open in Tab activates existing tab instead of duplicating
    When I upload model file "test-cube.glb"
    And the upload completes successfully
    When I click the "Open in Tab" button for "test-cube.glb"
    Then a model viewer tab should be opened in the URL
    # Click again - should not duplicate
    When I click the "Open in Tab" button for "test-cube.glb"
    Then there should be only one model tab in the URL
    And the model viewer should be visible

  @clear-completed
  Scenario: Clear Completed button removes finished uploads
    When I upload model file "test-cube.glb"
    And the upload completes successfully
    Then the "Clear Completed" button should be visible
    When I click the "Clear Completed" button
    Then the upload window should be hidden or empty
