@depends-on:setup
Feature: Shared File Protection
  Tests that hash-based file deduplication protects shared files during deletion.
  When two models share the same physical file (same SHA256 hash), deleting one
  model should not destroy the file used by the other model.

  @shared-file-protection
  Scenario: Permanently deleting one model does not destroy files used by another
    Given I upload two models sharing the same source file via API
    When I soft-delete and permanently delete the first model
    Then the second model should still be accessible via API
    And the second model's file should still be downloadable
    And the shared file hash should still exist in the database
