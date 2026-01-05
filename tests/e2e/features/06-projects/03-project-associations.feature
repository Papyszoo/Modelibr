@depends-on:projects-setup @projects @add-model
Feature: Project Associations
  Add and remove models and texture sets from projects

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

  @add-texture-set
  Scenario: Add texture set to project
    Given the project "Test Project" exists
    And the texture set "blue_color" exists
    When I am on the project viewer for "Test Project"
    And I add texture set "blue_color" to the project
    Then the project should contain texture set "blue_color"

  @remove-texture-set
  Scenario: Remove texture set from project
    Given the project "Test Project" exists
    And the texture set "blue_color" exists
    When I am on the project viewer for "Test Project"
    And the project contains texture set "blue_color"
    And I remove texture set "blue_color" from the project
    Then the project should not contain texture set "blue_color"
