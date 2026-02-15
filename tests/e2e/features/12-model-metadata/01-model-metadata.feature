@depends-on:setup @model-management @model-metadata
Feature: Model Tags and Description
  Tests that model tags and description can be edited and saved via the info panel.

  Background:
    Given I am on the model list page

  @model-tags-add
  Scenario: Add tags to a model
    Given I open a model in the viewer
    And I open the model info panel
    When I add the tag "character"
    And I add the tag "low-poly"
    And I save the model info changes
    Then the tags "character" and "low-poly" should be saved

  @model-tags-remove
  Scenario: Remove a tag from a model
    Given I open a model in the viewer
    And I open the model info panel
    And the model has at least one tag
    When I remove the first tag
    And I save the model info changes
    Then the tag count should have decreased

  @model-description
  Scenario: Edit model description
    Given I open a model in the viewer
    And I open the model info panel
    When I set the description to "A test 3D model for E2E testing"
    And I save the model info changes
    Then the description should be saved as "A test 3D model for E2E testing"

  @model-search
  Scenario: Search filters models by name
    When I search for models with "test"
    Then the model list should show filtered results
    When I clear the model search
    Then more models should be visible
