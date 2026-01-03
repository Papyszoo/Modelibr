@depends-on:packs-setup @packs
Feature: Pack CRUD Operations
  Tests for creating, reading, updating, and deleting packs.

  Scenario: Create a new pack with name and description
    Given I am on the pack list page
    When I create a pack named "Test Asset Pack" with description "A test pack for E2E testing"
    Then the pack "Test Asset Pack" should be visible in the pack list
    And the pack "Test Asset Pack" should be stored in shared state
    And I take a screenshot of the pack list

  Scenario: Create a pack without description
    Given I am on the pack list page
    When I create a pack named "Minimal Pack" without description
    Then the pack "Minimal Pack" should be visible in the pack list

  Scenario: Delete a pack
    Given the following packs exist in shared state:
      | name          |
      | Minimal Pack  |
    And I am on the pack list page
    When I delete the pack "Minimal Pack"
    Then the pack "Minimal Pack" should not be visible in the pack list
    And I take a screenshot after deletion
