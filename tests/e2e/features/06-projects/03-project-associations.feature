@depends-on:projects-setup @projects @add-model
Feature: Project Associations
  Add and remove models from projects

  Scenario: Add model to project
    Given the project "Test Project" exists
    When I am on the project viewer for "Test Project"
    And I add model "project-test-model" to the project
    Then the project should contain model "project-test-model"

  @remove-model
  Scenario: Remove model from project
    Given the project "Test Project" exists
    When I am on the project viewer for "Test Project"
    And the project contains model "project-test-model"
    And I remove model "project-test-model" from the project
    Then the project should not contain model "project-test-model"
