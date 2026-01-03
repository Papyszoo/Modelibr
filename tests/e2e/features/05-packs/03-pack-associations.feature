@depends-on:packs-setup @packs
Feature: Pack Associations
  Tests for adding and removing models to/from packs.

  Background:
    Given the following packs exist in shared state:
      | name            |
      | Test Asset Pack |
    And the following models exist in shared state:
      | name             |
      | pack-test-model  |

  Scenario: Open pack viewer shows pack details
    Given I am on the pack list page
    When I open the pack "Test Asset Pack"
    Then the pack viewer should be visible
    And the pack name "Test Asset Pack" should be displayed
    And I take a screenshot of the pack viewer

  @add-model
  Scenario: Add model to pack
    Given I am on the pack viewer for "Test Asset Pack"
    When I add model "pack-test-model" to the pack
    Then the pack should contain model "pack-test-model"
    And I take a screenshot showing model in pack

  @remove-model
  Scenario: Remove model from pack
    Given I am on the pack viewer for "Test Asset Pack"
    And the pack contains model "pack-test-model"
    When I remove model "pack-test-model" from the pack
    Then the pack should not contain model "pack-test-model"
