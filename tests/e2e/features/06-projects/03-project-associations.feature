@depends-on:projects-setup @projects @project-associations @batch1 @add-model
Feature: Project Associations
  Add and remove models and texture sets from projects

  # Each scenario owns its own project. The add and its matching remove used to
  # share "Test Project" and the one shared model, so in the parallel chromium
  # lane the remove could observe the model the add had just put there and then
  # remove it out from under the add scenario's assertion (or vice versa). One
  # project per scenario means the two write to disjoint state and the order
  # they run in stops mattering.

  Scenario: Add model to project
    Given the project "Associations Add Model Project" exists
    When I am on the project viewer for "Associations Add Model Project"
    And I add model "project-test-model" to the project
    Then the project should contain model "project-test-model"

  @remove-model
  Scenario: Remove model from project
    Given the project "Associations Remove Model Project" exists
    When I am on the project viewer for "Associations Remove Model Project"
    And the project contains model "project-test-model"
    And I remove model "project-test-model" from the project
    Then the project should not contain model "project-test-model"

  @add-multi-model-texture
  Scenario: Add multi-model texture to project
    Given the project "Associations Add Texture Project" exists
    And the texture set "blue_color" exists
    When I am on the project viewer for "Associations Add Texture Project"
    And I add texture set "blue_color" to the project
    Then the project should contain texture set "blue_color"

  @remove-multi-model-texture
  Scenario: Remove multi-model texture from project
    Given the project "Associations Remove Texture Project" exists
    And the texture set "blue_color" exists
    When I am on the project viewer for "Associations Remove Texture Project"
    And the project contains texture set "blue_color"
    And I remove texture set "blue_color" from the project
    Then the project should not contain texture set "blue_color"

  @add-global-material
  Scenario: Add global material to project
    Given the project "Associations Add Material Project" exists
    And the global material "stone_global" exists
    When I am on the project viewer for "Associations Add Material Project"
    And I add global material "stone_global" to the project
    Then the project should contain global material "stone_global"

  @remove-global-material
  Scenario: Remove global material from project
    Given the project "Associations Remove Material Project" exists
    And the global material "stone_global" exists
    When I am on the project viewer for "Associations Remove Material Project"
    And the project contains global material "stone_global"
    And I remove global material "stone_global" from the project
    Then the project should not contain global material "stone_global"
