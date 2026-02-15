@settings
Feature: Application Settings
  Tests that application settings can be viewed, modified, validated, and saved.
  Settings control file upload limits, thumbnail generation parameters, and appearance.

  Background:
    Given I am on the settings page

  @settings-display
  Scenario: Settings page displays all configuration fields
    Then the settings page title should be "Application Settings"
    And the max file size field should have a value
    And the max thumbnail size field should have a value
    And the frame count field should have a value
    And the camera angle field should have a value
    And the thumbnail width field should have a value
    And the thumbnail height field should have a value
    And the save button should be disabled

  @settings-modify
  Scenario: Modifying a setting enables the save button
    When I change the thumbnail width to "512"
    Then the save button should be enabled
    And the unsaved changes indicator should be visible

  @settings-save
  Scenario: Saving settings persists changes
    When I change the thumbnail width to "512"
    And I save the settings
    Then the success message should be visible
    When I reload the settings page
    Then the thumbnail width should be "512"
    # Restore original value
    When I change the thumbnail width to "384"
    And I save the settings

  @settings-validation
  Scenario: Invalid values show validation errors
    When I change the max file size to "0"
    Then a validation error should be visible
    And the save button should be disabled

  @settings-theme
  Scenario: Theme can be changed between light and dark
    When I change the theme to "dark"
    Then the theme should be "dark"
    When I change the theme to "light"
    Then the theme should be "light"
