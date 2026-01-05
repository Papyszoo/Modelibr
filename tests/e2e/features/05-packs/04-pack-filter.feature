@packs @filter @independent
Feature: Pack Filter on Model List
  Test filtering the model list by pack.
  This test is independent and creates its own resources.

  Scenario: Filter model list by pack
    # Setup: Create a fresh pack and model for this test
    Given I create a test pack named "Filter Test Pack" via API
    And I create a unique test model named "filter-pack-model" via API
    And I add the model "filter-pack-model" to the pack "Filter Test Pack" via API
    And I am on the model list page
    
    # Test: Filter by pack
    When I filter the model list by pack "Filter Test Pack"
    Then the model list should show model "filter-pack-model"
    And I take a screenshot of filtered model list

  Scenario: Clear pack filter shows all models
    Given I create a test pack named "Clear Filter Pack" via API
    And I create a unique test model named "clear-filter-model" via API
    And I add the model "clear-filter-model" to the pack "Clear Filter Pack" via API
    And I am on the model list page
    And the model list is filtered by pack "Clear Filter Pack"
    When I clear the model list filter
    Then the model list should show all models
