@depends-on:setup
Feature: Recycle Bin Visibility
  Tests that deleted items appear in recycle bin and not in main grids

  Background:
    Given I am on the model list page

  @recycle-empty
  Scenario: Empty state shown when no recycled items
    Given there are no recycled items
    When I navigate to the Recycled Files page
    Then I should see the recycled files empty state

  @recycle-visibility
  Scenario: Recycled model does not appear in model list
    Given I upload a model for recycling test "recycle-test-model"
    And I take a screenshot of the model list before recycling
    When I recycle the uploaded model
    And I am on the model list page
    Then the model "recycle-test-model" should not be visible in the grid
    And I take a screenshot of the model list after recycling

  @recycle-in-bin
  Scenario: Recycled model appears in recycle bin
    Given I upload and delete a model "recycle-bin-test"
    When I navigate to the Recycled Files page
    Then the recycle bin should be visible
    And I should see the model "recycle-bin-test" in the recycle bin
    And I take a screenshot of the recycle bin
