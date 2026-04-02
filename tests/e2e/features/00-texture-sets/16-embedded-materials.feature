@depends-on:setup,create-texture-sets
Feature: Embedded Materials Preset
  Tests the built-in "Embedded" preset that preserves the model's original
  PBR materials. Verifies UI behavior: preset selection, "Embedded" label
  on unlinked materials, hidden Link Texture Set buttons, and the ability
  to set Embedded as the main variant.

  Background:
    Given the following models exist in shared state:
      | name                 |
      | single-version-model |

  # ── Embedded preset is always available in the dropdown ─────────────

  @embedded-materials @serial
  Scenario: Embedded preset appears in dropdown
    Given I am on the model viewer page for "single-version-model"
    Then the preset dropdown should contain "Embedded"

  # ── Selecting Embedded shows correct UI state ──────────────────────

  @embedded-materials @serial
  Scenario: Embedded preset hides Link Texture Set buttons
    Given I am on the model viewer page for "single-version-model"
    When I select preset "Embedded"
    Then the preset "Embedded" should be selected
    And the "Link Texture Set" buttons should be hidden
    And all unlinked materials should show "Embedded" indicator

  @embedded-materials @serial
  Scenario: Switching from Embedded to Default restores Link buttons
    Given I am on the model viewer page for "single-version-model"
    When I select preset "Embedded"
    Then the "Link Texture Set" buttons should be hidden
    When I select preset "Default"
    Then the "Link Texture Set" buttons should be visible

  # ── Set Embedded as main variant ───────────────────────────────────

  @embedded-materials @serial
  Scenario: Set Embedded as main variant
    Given I am on the model viewer page for "single-version-model"
    When I select preset "Embedded"
    And I set the current preset as main
    Then the current preset should show the "Main" badge

  # ── Embedded as main persists after page reload ────────────────────

  @embedded-materials @serial
  Scenario: Embedded as main persists after navigation
    Given I am on the model viewer page for "single-version-model"
    Then the preset "Embedded" should be selected
    And the current preset should show the "Main" badge
    When I navigate away from the model viewer
    And I am on the model viewer page for "single-version-model"
    Then the preset "Embedded" should be selected
    And the current preset should show the "Main" badge

  # ── Restore Default as main (cleanup) ──────────────────────────────

  @embedded-materials @serial
  Scenario: Restore Default as main variant after tests
    Given I am on the model viewer page for "single-version-model"
    When I select preset "Default"
    And I set the current preset as main
    Then the current preset should show the "Main" badge
