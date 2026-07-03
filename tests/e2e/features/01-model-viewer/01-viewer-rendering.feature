@depends-on:setup
Feature: Model 3D Viewer Rendering
  Tests that 3D models render correctly in the React Three Fiber viewer.

  Background:
    Given the following models exist in shared state:
      | name                 |
      | multi-version-model  |

  @three-js @rendering @serial @timeout:300000
  Scenario: Model renders in 3D canvas after opening viewer
    Given I am on the model viewer page for "multi-version-model"
    Then the 3D canvas should be visible
    And the model name "test-cube" should be displayed in the header
    And the viewer controls should be visible
    And I take a screenshot of the 3D model rendering

  # @serial: opening the viewer page waits for the 3D canvas to become ready.
  # On GitHub's GPU-less runners the SwiftShader software render times out at
  # the drained-runner tail (this scenario flaked on the v0.3.0 main push);
  # it passes on a real GPU, so it runs on the local GPU lane only. See
  # CLAUDE.md testing rule 3.
  @ui @controls @serial
  Scenario: Menubar controls are accessible
    Given I am on the model viewer page for "multi-version-model"
    Then the following control buttons should be visible:
      | button            |
      | Left Panel        |
      | File              |
      | Viewer            |
      | Right Panel       |
    And I take a screenshot of the control buttons
