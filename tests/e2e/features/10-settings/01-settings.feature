@settings @serial
Feature: Application Settings
  Tests that application settings can be viewed, modified, validated, and saved.
  Settings control file upload limits, thumbnail generation parameters, and appearance.

  Background:
    Given settings are reset to defaults via API
    And I am on the settings page

  @settings-display
  Scenario: Settings page displays all configuration fields
    Then the settings page title should be "Settings"
    And the settings grid should be visible
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

  # ── Grid + navigation ─────────────────────────────────────────────

  @settings-grid-cards
  Scenario: All eight settings sections are listed in the grid
    Then the grid should show the following section cards:
      | Appearance           |
      | File Upload          |
      | Thumbnail Generation |
      | Texture Proxy        |
      | Blender              |
      | SSL Certificate      |
      | WebDAV               |
      | Backup & Restore     |

  @settings-grid-open-card
  Scenario: Clicking a card opens its section detail
    When I open the "File Upload" section card
    Then I should be in the "File Upload" section
    And the save button should be visible
    When I click the back button
    Then the settings grid should be visible

  @settings-grid-back-clean
  Scenario: Back button on a clean section returns to the grid without prompting
    When I open the "Thumbnail Generation" section card
    And I click the back button
    Then the settings grid should be visible

  @settings-discard-resets
  Scenario: Discard resets unsaved changes in the current section
    When I open the "Texture Proxy" section card
    And I change the texture proxy size to "1024"
    Then the save button should be enabled
    When I click discard
    Then the texture proxy size should be "512"
    And the save button should be disabled

  # ── Section state persists across tab switches ────────────────────

  @settings-section-tab-persistence
  Scenario: Active section is remembered when switching away and back
    When I open the "Thumbnail Generation" section card
    Then I should be in the "Thumbnail Generation" section
    When I switch to the model list tab
    And I return to the settings tab
    Then I should be in the "Thumbnail Generation" section

  # ── Search ────────────────────────────────────────────────────────

  @settings-search-results
  Scenario: Searching surfaces matching section labels and fields
    When I search settings for "frame"
    Then the search dropdown should be visible
    And the search results should include "Frame count"
    And the search results should include "Thumbnail Generation"

  @settings-search-dimming
  Scenario: Cards for non-matching sections are dimmed
    When I search settings for "blender"
    Then the dimmed card labels should not include "Blender"
    And the dimmed card labels should include "Appearance"

  @settings-search-click
  Scenario: Clicking a search result opens its section and clears the search
    When I search settings for "frame"
    And I click the first search result
    Then I should be in the "Thumbnail Generation" section

  # ── Persistence of newer settings ─────────────────────────────────

  @settings-texture-proxy-persist
  Scenario: Texture proxy size persists across reload
    When I open the "Texture Proxy" section card
    And I change the texture proxy size to "1024"
    And I save the settings
    Then the success message should be visible
    When I reload the settings page
    Then the texture proxy size should be "1024"
    # Restore default so the run is hermetic
    When I change the texture proxy size to "512"
    And I save the settings

  @settings-duplicate-name-policy-persist
  Scenario: Duplicate name policy persists across reload
    When I change the duplicate name policy to "AutoRename"
    Then the duplicate name policy should be "AutoRename"
    When I reload the settings page
    Then the duplicate name policy should be "AutoRename"
    # Restore default
    When I change the duplicate name policy to "Reject"

  @settings-theme-persist
  Scenario: Theme persists across reload
    When I change the theme to "dark"
    And I reload the settings page
    Then the theme should be "dark"
    When I change the theme to "light"
    And I reload the settings page
    Then the theme should be "light"

  @settings-mobile-bar-persist
  Scenario: Mobile tab bar position persists across reload
    When I change the mobile tab bar position to "bottom"
    Then the mobile tab bar position should be "bottom"
    When I reload the settings page
    Then the mobile tab bar position should be "bottom"
    # Restore default
    When I change the mobile tab bar position to "left"

  # ── SSL section sanity check ──────────────────────────────────────

  @settings-ssl-download-link
  Scenario: SSL Certificate section exposes a download link
    When I open the "SSL Certificate" section card
    Then the SSL certificate download link should be visible
    And the SSL certificate download link should point at "modelibr-cert.crt"
