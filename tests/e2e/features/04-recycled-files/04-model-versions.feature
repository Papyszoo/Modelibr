@depends-on:setup
Feature: Recycled Model Versions
  Tests that individual model versions can be recycled, restored, and permanently deleted

  Background:
    Given I am on the model list page

  @recycle-version @skip
  Scenario: Recycling a version removes it from the model but keeps model
    # Skip: Requires investigation of proper Add Version UI flow
    Given I upload a model with multiple versions for recycling test "version-recycle-test"
    And I take a screenshot of the model with multiple versions
    When I navigate to the model viewer for "version-recycle-test"
    And I delete version 1 from the model
    Then the model should only show 1 version
    And I take a screenshot after version deleted

  @version-in-recycle-bin @skip
  Scenario: Recycled version appears in recycle bin versions section
    # Skip: Requires investigation of proper Add Version UI flow
    Given I upload a model with multiple versions for recycling test "version-bin-test"
    When I navigate to the model viewer for "version-bin-test"
    And I delete version 1 from the model
    And I navigate to the Recycled Files page
    Then I should see the version in the recycled model versions section
    And I take a screenshot of the recycled versions section

  @restore-version @skip
  Scenario: Restoring a version adds it back to the model
    # Skip: Requires investigation of proper Add Version UI flow
    Given I upload a model with multiple versions for recycling test "version-restore-test"
    When I navigate to the model viewer for "version-restore-test"
    And I delete version 1 from the model
    And I navigate to the Recycled Files page
    And I restore the recycled model version
    Then the version should be removed from the recycle bin
    And I navigate to the model viewer for "version-restore-test"
    Then the model should have 2 versions
    And I take a screenshot of restored version
