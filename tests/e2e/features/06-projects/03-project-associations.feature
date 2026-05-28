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

  @add-multi-model-texture
  Scenario: Add multi-model texture to project
    Given the project "Test Project" exists
    And the texture set "blue_color" exists
    When I am on the project viewer for "Test Project"
    And I add texture set "blue_color" to the project
    Then the project should contain texture set "blue_color"

  @remove-multi-model-texture
  Scenario: Remove multi-model texture from project
    Given the project "Test Project" exists
    And the texture set "blue_color" exists
    When I am on the project viewer for "Test Project"
    And the project contains texture set "blue_color"
    And I remove texture set "blue_color" from the project
    Then the project should not contain texture set "blue_color"

  @add-global-material
  Scenario: Add global material to project
    Given the project "Test Project" exists
    And the global material "stone_global" exists
    When I am on the project viewer for "Test Project"
    And I add global material "stone_global" to the project
    Then the project should contain global material "stone_global"

  @remove-global-material
  Scenario: Remove global material from project
    Given the project "Test Project" exists
    And the global material "stone_global" exists
    When I am on the project viewer for "Test Project"
    And the project contains global material "stone_global"
    And I remove global material "stone_global" from the project
    Then the project should not contain global material "stone_global"
