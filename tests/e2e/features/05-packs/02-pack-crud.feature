@depends-on:packs-setup @packs @serial
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

  @pack-metadata
  Scenario: Create a new pack with license type and reference URL
    Given I am on the pack list page
    When I create a pack named "Licensed Pack" with description "A pack with publishing metadata" license type "CC BY" and url "https://example.com/licensed-pack"
    Then the pack "Licensed Pack" should be visible in the pack list
    And the pack "Licensed Pack" should be stored in shared state
    And the pack "Licensed Pack" card should show license type "CC BY"
    And the pack "Licensed Pack" card should show a link badge
    When I open the pack "Licensed Pack"
    Then the pack viewer should be visible
    And the pack details should show license type "CC BY" and url "https://example.com/licensed-pack"

  @pack-thumbnail
  Scenario: Pack custom thumbnail renders in list and details
    Given I am on the pack list page
    When I create a pack named "Pack With Thumbnail" with description "A pack with a custom thumbnail"
    And I upload the image "blue_color.png" as the custom thumbnail for pack "Pack With Thumbnail"
    Then the pack "Pack With Thumbnail" should be visible in the pack list
    And the pack "Pack With Thumbnail" card should render the uploaded custom thumbnail
    When I open the pack "Pack With Thumbnail"
    Then the pack viewer should be visible
    And the pack "Pack With Thumbnail" details should render the uploaded custom thumbnail

  Scenario: Delete a pack
    Given the following packs exist in shared state:
      | name          |
      | Minimal Pack  |
    And I am on the pack list page
    When I delete the pack "Minimal Pack"
    Then the pack "Minimal Pack" should not be visible in the pack list
    And I take a screenshot after deletion
