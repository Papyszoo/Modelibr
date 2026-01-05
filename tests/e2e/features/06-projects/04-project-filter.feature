@projects @filter @independent
Feature: Project Filter on Model List
  Test filtering the model list by project.
  This test is independent and creates its own resources.

  Scenario: Filter model list by project
    # Setup: Create a fresh project and model for this test
    Given I create a test project named "Filter Test Project" via API
    And I create a unique test model named "filter-project-model" via API
    And I add the model "filter-project-model" to the project "Filter Test Project" via API
    And I am on the model list page
    
    # Test: Filter by project
    When I filter the model list by project "Filter Test Project"
    Then the model list should show model "filter-project-model"
    And I take a screenshot of filtered model list

  Scenario: Clear project filter shows all models
    Given I create a test project named "Clear Filter Project" via API
    And I create a unique test model named "clear-filter-proj-model" via API
    And I add the model "clear-filter-proj-model" to the project "Clear Filter Project" via API
    And I am on the model list page
    And the model list is filtered by project "Clear Filter Project"
    When I clear the model list filter
    Then the model list should show all models
