Feature: Model Upload and Processing

  @timeout:300000 @slow
  Scenario: Uploading a model shows real-time status updates
    Given I am on the model list page
    When I upload a 3D model "test-icosphere.fbx"
    Then I should see "test-icosphere" in the model list
    And the model status should eventually be "Ready"

  # Guards the STL pipeline end to end: on the pre-feature code this upload was
  # rejected (frontend format validation + backend ValidateForModelUpload both
  # treated .stl as unsupported), so this scenario fails without the feature and
  # passes with it. No thumbnail wait, so it stays in the fast PR lane.
  Scenario: Uploading an STL model stores it as a renderable model
    Given I am on the model list page
    When I upload a model "test-cube.stl" and store it as "stl-cube"
    Then the model "stl-cube" should be stored as a renderable "stl" file
