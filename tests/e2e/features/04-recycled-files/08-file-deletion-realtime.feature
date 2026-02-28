@depends-on:setup
Feature: File Deletion Real-Time Updates in Split Panel
  Ensures that deleting a file via the FilesTab updates the open Recycled Files
  panel in real time — no navigation or manual refresh required.

  Background:
    Given I am on the model list page

  @file-realtime-update
  Scenario: Deleting a file from FilesTab appears in Recycled Files panel immediately
    Given a texture set "realtime-test-ts" with an uploaded file exists
    And the Recycled Files page is open in the right panel
    And I have the texture set "realtime-test-ts" open in the Files tab in the left panel
    When I delete the first file from the Files tab
    Then the recycled files panel in the right should show the deleted file without navigation
    And I take a screenshot named "file-deletion-realtime-update"

  @no-double-modal
  Scenario: Deleting a file with Recycled Files panel open shows only one dialog
    Given a texture set "double-modal-test-ts" with an uploaded file exists
    And the Recycled Files page is open in the right panel
    And I have the texture set "double-modal-test-ts" open in the Files tab in the left panel
    When I click delete on the first file in the Files tab
    Then exactly one confirmation dialog should be visible
    And I take a screenshot named "single-confirm-dialog"
    When I confirm the file deletion dialog
    Then the confirmation dialog should close
