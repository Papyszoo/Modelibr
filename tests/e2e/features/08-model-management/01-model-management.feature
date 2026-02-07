@depends-on:setup @models
Feature: Model Management Operations
  Delete model versions, regenerate thumbnails, and upload custom thumbnails.

  Background:
    Given I am on the model list page

  @delete-version
  Scenario: Delete a model version
    Given a model with at least 2 versions exists
    When I open the model viewer for the multi-version model
    And I open the version dropdown
    And I delete version 1
    Then the model should have 1 version remaining
    And I take a screenshot of model version deletion

  @regenerate-thumbnail
  Scenario: Regenerate model thumbnail
    Given the test model "Test Model" exists
    When I open the model viewer for "Test Model"
    And I click the regenerate thumbnail button
    Then I should see a success message for thumbnail regeneration
    And I take a screenshot of regenerated thumbnail
