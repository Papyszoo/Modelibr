@depends-on:projects-setup @projects @serial
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

  @project-notes
  Scenario: Create a project with notes
    Given I am on the project list page
    When I create a project named "Project With Notes" with description "A project with planning notes" and notes "Remember to review the final lighting pass"
    Then the project "Project With Notes" should be visible
    And the project "Project With Notes" should be stored in shared state
    And the project "Project With Notes" card should show notes "Remember to review the final lighting pass"
    When I open the project "Project With Notes"
    Then the project viewer should be visible
    And the project details should show notes "Remember to review the final lighting pass"

  @project-thumbnail
  Scenario: Project custom thumbnail renders in list and details
    Given I am on the project list page
    When I create a project named "Project With Thumbnail" with description "A project with a custom thumbnail"
    And I upload the image "blue_color.png" as the custom thumbnail for project "Project With Thumbnail"
    Then the project "Project With Thumbnail" should be visible
    And the project "Project With Thumbnail" card should render the uploaded custom thumbnail
    When I open the project "Project With Thumbnail"
    Then the project viewer should be visible
    And the project "Project With Thumbnail" details should render the uploaded custom thumbnail

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
