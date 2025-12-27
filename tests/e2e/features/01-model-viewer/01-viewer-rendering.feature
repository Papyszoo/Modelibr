@depends-on:setup
Feature: Model 3D Viewer Rendering
  Tests that 3D models render correctly in the React Three Fiber viewer.

  Background:
    Given the following models exist in shared state:
      | name                 |
      | multi-version-model  |

  @three-js @rendering
  Scenario: Model renders in 3D canvas after opening viewer
    Given I am on the model viewer page for "multi-version-model"
    Then the 3D canvas should be visible
    And the model name "test-torus" should be displayed in the header
    And the viewer controls should be visible
    And I take a screenshot of the 3D model rendering

  @ui @controls
  Scenario: Floating control buttons are accessible
    Given I am on the model viewer page for "multi-version-model"
    Then the following control buttons should be visible:
      | button            |
      | Add Version       |
      | Viewer Settings   |
      | Model Info        |
      | Texture Sets      |
      | Model Hierarchy   |
      | Thumbnail Details |
      | UV Map            |
    And I take a screenshot of the control buttons
