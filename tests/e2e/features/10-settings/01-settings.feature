@settings @serial
Feature: Application Settings
  Tests that application settings can be viewed, modified, validated, and saved.
  Settings control file upload limits, thumbnail generation parameters, and appearance.

  Background:
    Given settings are reset to defaults via API
    And I am on the settings page

  @settings-display
  Scenario: Settings page displays all configuration fields
    Then the settings page title should be "Application Settings"
    And the max file size field should have a value
    And the max thumbnail size field should have a value
    And the frame count field should have a value
    And the thumbnail size field should have a value
    And the save button should be disabled

  @settings-modify
  Scenario: Modifying a setting enables the save button
    When I change the thumbnail size to "512"
    Then the save button should be enabled
    And the unsaved changes indicator should be visible

  @settings-save
  Scenario: Saving settings persists changes
    When I change the thumbnail size to "512"
    And I save the settings
    Then the success message should be visible
    When I reload the settings page
    Then the thumbnail size should be "512"
    # Restore original value
    When I change the thumbnail size to "256"
    And I save the settings

  @settings-validation
  Scenario: Invalid values show validation errors
    When I change the max file size to "0"
    Then a validation error should be visible
    And the save button should be disabled

  @settings-animated-default
  Scenario: Generate Animated Thumbnail is on by default and Frame Count is visible
    Then the generate animated thumbnail checkbox should be checked
    And the frame count field should be visible

  @settings-animated-toggle
  Scenario: Disabling animated thumbnails hides the Frame Count field
    When I toggle generate animated thumbnail
    Then the generate animated thumbnail checkbox should be unchecked
    And the frame count field should not be visible
    When I toggle generate animated thumbnail
    Then the generate animated thumbnail checkbox should be checked
    And the frame count field should be visible

  @settings-animated-persist
  Scenario: Animated thumbnail preference persists across reload
    When I toggle generate animated thumbnail
    And I save the settings
    Then the success message should be visible
    When I reload the settings page
    Then the generate animated thumbnail checkbox should be unchecked
    And the frame count field should not be visible

  @settings-regenerate-button
  Scenario: Regenerate All Thumbnails button is visible
    Then the regenerate all thumbnails button should be visible

  @settings-regenerate-click
  Scenario: Clicking Regenerate All Thumbnails enqueues regeneration
    When I click the regenerate all thumbnails button
    Then a regenerate success message should be visible

  @settings-regenerate-confirm-cancel
  Scenario: Cancelling the regenerate confirmation does nothing
    When I open the regenerate all thumbnails confirmation
    Then the regenerate confirmation dialog should be visible
    When I cancel the regenerate confirmation
    Then a regenerate success message should not be visible

  @settings-theme
  Scenario: Theme can be changed between light and dark
    When I change the theme to "dark"
    Then the theme should be "dark"
    When I change the theme to "light"
    Then the theme should be "light"
