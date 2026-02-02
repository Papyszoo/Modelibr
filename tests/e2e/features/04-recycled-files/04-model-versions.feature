@depends-on:setup @independent
Feature: Recycled Model Versions
  Tests that individual model versions can be recycled, restored, and permanently deleted

  Background:
    Given I am on the model list page

  @recycle-version
  Scenario: Delete version removes it from the model
    Given a model with at least 2 versions exists
    When I open the model viewer for the multi-version model
    And I open the version dropdown
    Then I take a screenshot of model before version deletion
    When I delete version 1
    Then the model should have 1 version remaining
    And I take a screenshot of model version deletion

  @version-in-recycle-bin
  Scenario: Deleted version appears in recycle bin versions section
    Given a model with at least 2 versions exists
    When I open the model viewer for the multi-version model
    And I open the version dropdown
    And I delete version 1
    Then I take a screenshot showing version not in version strip
    When I navigate to the Recycled Files page
    Then I should see the version in the recycled model versions section
    And I take a screenshot showing version in recycled files
    When I restore the recycled model version
    And I navigate to the Recycled Files page
    Then I take a screenshot showing version not in recycled files
    When I navigate back to the model viewer
    And I open the version dropdown
    Then I take a screenshot showing restored version in version strip

  @restore-version
  Scenario: Restoring a version adds it back to the model
    Given a model with at least 2 versions exists
    When I open the model viewer for the multi-version model
    And I open the version dropdown
    And I delete version 1
    Then the model should have 1 version remaining
    When I navigate to the Recycled Files page
    And I restore the recycled model version
    Then the version should be removed from the recycle bin
    And I navigate back to the model viewer with force refresh
    Then the model should have 2 versions
    And I take a screenshot of restored version
