@depends-on:setup
Feature: Error Scenarios
  Tests that the application handles error conditions gracefully,
  displaying appropriate error messages and recovering properly.

  @error-invalid-file-upload
  Scenario: Uploading an invalid file type shows error feedback
    Given I am on the model list page
    When I attempt to upload an invalid file "package.json"
    Then an error indicator should be displayed
    And the model list should remain unchanged

  @error-nonexistent-resource
  Scenario: Requesting a non-existent model via API returns 404
    When I request model with ID 999999 via API
    Then the API should return a 404 status

  @error-nonexistent-delete
  Scenario: Deleting a non-existent model via API returns error
    When I attempt to delete model with ID 999999 via API
    Then the API should return a non-success status

  @error-duplicate-category
  Scenario: Creating a duplicate sprite category shows error
    Given I am on the sprites page for error test
    When I open the category management dialog for error test
    And I create a category named "error-test-category" for error test
    And I open the category management dialog for error test
    And I attempt to create a duplicate category named "error-test-category"
    Then a category error should be displayed or creation should be prevented
