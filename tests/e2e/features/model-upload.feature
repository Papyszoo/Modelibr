Feature: Model Upload and Processing

  Scenario: Uploading a model shows real-time status updates
    Given I am on the model list page
    When I upload a 3D model "test-icosphere.fbx"
    Then I should see "test-icosphere.fbx" in the list
    And the model status should eventually be "Ready"
