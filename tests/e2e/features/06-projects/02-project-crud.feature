@depends-on:projects-setup @projects
Feature: Project CRUD Operations
  Tests for creating, reading, updating, and deleting projects.

  Scenario: Create a new project with name and description
    Given I am on the project list page
    When I create a project named "Test Project" with description "A test project for E2E testing"
    Then the project "Test Project" should be visible
    And the project "Test Project" should be stored in shared state

  Scenario: Create a project without description
    Given I am on the project list page
    When I create a project named "Minimal Project" without description
    Then the project "Minimal Project" should be visible

  Scenario: Delete a project
    Given the project "Minimal Project" exists
    And I am on the project list page
    When I delete the project "Minimal Project"
    Then the project "Minimal Project" should not be visible

  Scenario: Open project viewer shows project details
    Given the project "Test Project" exists
    When I navigate to the project list
    And I open the project "Test Project"
    Then the project viewer should be visible
    And I should see the project name "Test Project"
