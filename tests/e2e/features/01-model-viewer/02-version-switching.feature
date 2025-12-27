@depends-on:setup
Feature: Version Switching

  Background:
    Given the following models exist in shared state:
      | name                |
      | multi-version-model |

  Scenario: Version dropdown shows all versions with thumbnails
    Given I am on the model viewer page for "multi-version-model"
    When I open the version dropdown
    Then I should see version 1 in the dropdown
    And I should see version 2 in the dropdown
    And version 1 should have a thumbnail image
    And version 2 should have a thumbnail image
    And I capture a screenshot of the version dropdown with thumbnails

  Scenario: Switching versions updates the viewer
    Given I am on the model viewer page for "multi-version-model"
    And I am viewing version 2
    When I switch to version 1
    Then the version indicator should show "v1"
    And the file info should show "test-torus.fbx"
    And I take a screenshot of version 1 active
    When I switch to version 2
    Then the version indicator should show "v2"
    And the file info should show "test-cylinder.fbx"
    And I take a screenshot of version 2 active
