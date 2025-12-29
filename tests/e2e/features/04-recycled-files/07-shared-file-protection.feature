@depends-on:setup
Feature: Shared File Protection
  Tests that files shared between multiple model versions are protected during deletion

  Background:
    Given I am on the model list page

  @shared-file-protection
  Scenario: Recycling a version with shared file preserves file for other versions
    Given I upload a model "shared-file-test" with texture
    When I upload a new version with different texture but same model file
    And I recycle the first version
    And I permanently delete the first version
    Then the model file should still exist for version 2
    And the first version's unique textures should be deleted

  @shared-texture-protection
  Scenario: Recycling a version with shared texture set preserves textures
    Given I upload a model "shared-texture-test" with texture
    When I upload a new version with different model but same texture
    And I recycle the second version
    And I permanently delete the second version
    Then the texture files should still exist for version 1
    And only the second version's model file should be deleted

  @orphaned-file-cleanup
  Scenario: Recycling the last version using a file deletes the file
    Given I upload a model "orphan-file-test" with texture
    When I recycle the model
    And I permanently delete the model
    Then all model files should be deleted from disk
    And all texture files should be deleted from disk
