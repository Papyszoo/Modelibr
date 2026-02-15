@stages
Feature: Stage CRUD Operations
  Tests that stages can be created, viewed, searched, and opened in the editor.
  Stages are scene configurations for 3D lighting and environment setup.

  Background:
    Given I am on the stages page

  @stage-create
  Scenario: Create a new stage
    When I create a stage named "Test Stage"
    Then the stage "Test Stage" should be visible in the list
    And a success toast should appear

  @stage-search
  Scenario: Search filters stages by name
    Given a stage named "Searchable Stage" exists
    When I search for "Searchable"
    Then the stage "Searchable Stage" should be visible in the list

  @stage-search-clear
  Scenario: Clearing search shows all stages
    Given a stage named "Hidden Stage" exists
    When I search for "nonexistent-xyz"
    Then no stages should be visible
    When I clear the search
    Then the stage "Hidden Stage" should be visible in the list

  @stage-open
  Scenario: Opening a stage shows the editor
    Given a stage named "Editor Stage" exists
    When I click on the stage "Editor Stage"
    Then the stage editor should be visible

  @stage-empty
  Scenario: Empty state shows when no stages exist
    When I search for "definitely-no-match-xyz-999"
    Then the empty state should be visible
