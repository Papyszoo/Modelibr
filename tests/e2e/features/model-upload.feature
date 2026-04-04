Feature: Model Upload and Processing

  @timeout:300000 @slow
  Scenario: Uploading a model shows real-time status updates
    Given I am on the model list page
    When I upload a 3D model "test-icosphere.fbx"
    Then I should see "test-icosphere" in the model list
    And the model status should eventually be "Ready"
