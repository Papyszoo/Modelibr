@depends-on:setup
Feature: Restore From Recycle Bin
  Tests that items can be restored from the recycle bin

  Background:
    Given I am on the model list page

  @restore-model
  Scenario: Restore model from recycle bin
    Given I upload and delete a model "restore-test-model"
    And the model "restore-test-model" is in the recycle bin
    When I navigate to the Recycled Files page
    And I restore the model "restore-test-model"
    Then the model should be removed from the recycle bin
    And I take a screenshot after restore

  @restore-appears-in-list
  Scenario: Restored model appears back in model list
    Given I upload and delete a model "restore-back-test"
    And the model "restore-back-test" is in the recycle bin
    When I navigate to the Recycled Files page
    And I restore the model "restore-back-test"
    And I navigate back to the model list
    Then the model "restore-back-test" should be visible in the grid
    And I take a screenshot of the restored model
