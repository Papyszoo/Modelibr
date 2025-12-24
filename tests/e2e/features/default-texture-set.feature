Feature: Default Texture Set per Version

  Scenario: Setting a default texture set for a model version
    Given I am on the model list page
    And I have uploaded a model "test-cube.glb"
    And I am on the model viewer page for "test-cube.glb"
    When I create a new texture set "Blue Material"
    And I upload texture "blue_color.png" to texture set "Blue Material"
    And I link texture set "Blue Material" to the model
    And I set "Blue Material" as the default texture set for the current version
    Then "Blue Material" should be marked as default in the texture set selector
    And the version thumbnail should eventually be "Ready"

  Scenario: Independent default texture sets for different versions
    Given I am on the model list page
    And I have uploaded a model "test-cube.glb"
    And I am on the model viewer page for "test-cube.glb"
    And I create a new texture set "Blue Material"
    And I upload texture "blue_color.png" to texture set "Blue Material"
    And I link texture set "Blue Material" to the model
    And I set "Blue Material" as the default texture set for the current version
    When I upload a new version "test-cylinder.fbx"
    And I select version 2
    And I create a new texture set "Red Material"
    And I upload texture "red_color.png" to texture set "Red Material"
    And I link texture set "Red Material" to the model
    And I set "Red Material" as the default texture set for version 2
    Then version 2 should have "Red Material" as default
    And I select version 1
    Then version 1 should still have "Blue Material" as default

  Scenario: Independent thumbnails for default texture sets for different versions
    Given I am on the model list page
    And I have uploaded a model "test-cube.glb"
    And I am on the model viewer page for "test-cube.glb"
    And I upload a new version "test-cylinder.fbx"
    And I have version 1 and version 2
    When I save thumbnail details for version 1 from database
    And I create a new texture set "Red Material"
    And I upload texture "red_color.png" to texture set "Red Material"
    And I link texture set "Red Material" to the model
    And I set "Red Material" as the default texture set for version 2
    Then thumbnail details for version 1 in database should remain unchanged
    And version 1 should have its original thumbnail in the version strip
    And version 2 should have a new thumbnail in the version strip
