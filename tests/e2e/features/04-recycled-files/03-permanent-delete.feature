@depends-on:setup
Feature: Permanent Delete (Delete Forever)
  Tests that permanent delete removes items from recycle bin and file system

  Background:
    Given I am on the model list page

  @delete-forever-dialog
  Scenario: Delete forever shows confirmation dialog
    Given I upload and delete a model "delete-dialog-test"
    When I navigate to the Recycled Files page
    And I click "Delete Forever" for model "delete-dialog-test"
    Then the delete confirmation dialog should appear
    And I take a screenshot of the delete dialog
    When I cancel the delete dialog
    Then the model should still be in the recycle bin

  @delete-forever-removes
  Scenario: Delete forever removes model completely
    Given I upload and delete a model "delete-forever-test"
    And I note the recycled model count
    When I navigate to the Recycled Files page
    And I take a screenshot of the recycle bin before delete
    And I click "Delete Forever" for model "delete-forever-test"
    And I confirm the permanent delete
    Then the model "delete-forever-test" should be removed from recycle bin
    And the database should not contain the model
    And I take a screenshot after permanent delete

  @delete-forever-other-unaffected
  Scenario: Other files remain unaffected after delete forever
    Given I upload and delete a model "keep-this-model"
    And I upload and delete a model "delete-this-model"
    When I navigate to the Recycled Files page
    And I take a screenshot of the recycle bin with both models
    And I click "Delete Forever" for model "delete-this-model"
    And I confirm the permanent delete
    Then the model "delete-this-model" should be removed from recycle bin
    But the model "keep-this-model" should still be in the recycle bin
    And I take a screenshot showing remaining model

  @permanent-delete-texture-set-api
  Scenario: Permanent delete via API removes texture set from database
    Given I create and soft-delete a texture set "perm-delete-texture" via API
    When I permanently delete the recycled texture set via API
    Then the texture set should no longer exist in the database

  @permanent-delete-sprite-api
  Scenario: Permanent delete via API removes sprite from database
    Given I create and soft-delete a sprite "perm-delete-sprite" via API
    When I permanently delete the recycled sprite via API
    Then the sprite should no longer exist in the database

  @permanent-delete-sound-api
  Scenario: Permanent delete via API removes sound from database
    Given I create and soft-delete a sound "perm-delete-sound" via API
    When I permanently delete the recycled sound via API
    Then the sound should no longer exist in the database

