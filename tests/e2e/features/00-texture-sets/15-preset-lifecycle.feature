@depends-on:setup,create-texture-sets
Feature: Preset Lifecycle, Texture Association, and Main Variant Thumbnails
  Comprehensive tests for preset (variant) management:
  - Creating, persisting, and deleting presets
  - Linking/unlinking texture sets per preset
  - Preset survives when last texture set is unlinked (Bug #1 fix)
  - Switching presets shows correct texture sets (Bug #3 fix)
  - Setting main variant and thumbnail regeneration (Bug #2 fix)

  Background:
    Given the following models exist in shared state:
      | name                 |
      | single-version-model |
    And the following texture sets exist in shared state:
      | name        |
      | blue_color  |
      | red_color   |

  # ── Preset Lifecycle ─────────────────────────────────────────────────

  @presets @preset-lifecycle @timeout:720000 @serial
  Scenario: Create a new preset via UI
    Given I am on the model viewer page for "single-version-model"
    When I add a new preset "Scratched"
    Then the preset "Scratched" should be selected
    And the preset dropdown should contain "Scratched"

  @presets @preset-lifecycle @timeout:720000 @serial
  Scenario: Preset persists after navigating away and back
    Given I am on the model viewer page for "single-version-model"
    When I add a new preset "Weathered" via API
    And I navigate away from the model viewer
    And I am on the model viewer page for "single-version-model"
    Then the preset dropdown should contain "Weathered"

  @presets @preset-lifecycle @timeout:720000 @serial
  Scenario: Delete a preset removes it from dropdown
    Given I am on the model viewer page for "single-version-model"
    When I add a new preset "ToDelete"
    Then the preset "ToDelete" should be selected
    When I delete the current preset
    Then the preset "Default" should be selected
    And the preset dropdown should not contain "ToDelete"

  # ── Texture Set Association ──────────────────────────────────────────

  @presets @texture-association @timeout:720000 @serial
  Scenario: Link texture set to a preset and verify it appears
    Given I am on the model viewer page for "single-version-model"
    When I add a new preset "Painted"
    And I link texture set "blue_color" to the current preset via UI
    Then the texture set "blue_color" should be linked in materials

  @presets @texture-association @timeout:720000 @serial
  Scenario: Unlink last texture set from a preset — preset still visible (Bug #1)
    Given I am on the model viewer page for "single-version-model"
    When I add a new preset "AlmostEmpty"
    And I link texture set "red_color" to the current preset via UI
    Then the texture set "red_color" should be linked in materials
    When I unlink texture set "red_color" from the current preset
    Then the texture set "red_color" should not be linked in materials
    And the preset dropdown should contain "AlmostEmpty"
    And the preset "AlmostEmpty" should be selected

  @presets @texture-association @timeout:720000 @serial
  Scenario: Two presets show different texture sets when switching (Bug #3)
    Given I am on the model viewer page for "single-version-model"
    # Create first preset with blue_color
    When I add a new preset "Variant_A"
    And I link texture set "blue_color" to the current preset via UI
    Then the texture set "blue_color" should be linked in materials
    # Create second preset with red_color
    When I add a new preset "Variant_B"
    And I link texture set "red_color" to the current preset via UI
    Then the texture set "red_color" should be linked in materials
    And the texture set "blue_color" should not be linked in materials
    # Switch back to Variant_A
    When I select preset "Variant_A"
    Then the texture set "blue_color" should be linked in materials
    And the texture set "red_color" should not be linked in materials
    # Switch to Variant_B again
    When I select preset "Variant_B"
    Then the texture set "red_color" should be linked in materials
    And the texture set "blue_color" should not be linked in materials

  @presets @texture-association @timeout:720000 @serial
  Scenario: Unlink texture set from a specific material
    Given I am on the model viewer page for "single-version-model"
    When I add a new preset "UnlinkMe"
    And I link texture set "blue_color" to the current preset via UI
    Then the texture set "blue_color" should be linked in materials
    When I unlink texture set "blue_color" from the current preset
    Then the texture set "blue_color" should not be linked in materials

  # ── Main Variant & Thumbnails ────────────────────────────────────────

  @presets @main-variant @timeout:720000 @serial
  Scenario: Set a preset as main variant
    Given I am on the model viewer page for "single-version-model"
    When I add a new preset "Primary"
    Then the preset "Primary" should be selected
    When I set the current preset as main
    Then the current preset should show the "Main" badge
    # Switch away and back — badge should persist
    When I select preset "Default"
    And I select preset "Primary"
    Then the current preset should show the "Main" badge

  @presets @main-variant @thumbnail @timeout:720000 @serial
  Scenario: Setting main variant triggers thumbnail regeneration with variant textures (Bug #2)
    Given I am on the model viewer page for "single-version-model"
    When I add a new preset "ThumbVariant" via API
    And I link texture set "red_color" to preset "ThumbVariant" via API
    And I set preset "ThumbVariant" as main variant via API
    Then the model thumbnail should regenerate within 60 seconds
    # Verify the preset is correctly shown as main in the UI
    And I am on the model viewer page for "single-version-model"
    When I select preset "ThumbVariant"
    Then the current preset should show the "Main" badge
    And the texture set "red_color" should be linked in materials

  @presets @preset-lifecycle @timeout:720000 @serial
  Scenario: Deleting a preset cleans up its texture mappings
    Given I am on the model viewer page for "single-version-model"
    When I add a new preset "Cleanup"
    And I link texture set "blue_color" to the current preset via UI
    Then the texture set "blue_color" should be linked in materials
    When I delete the current preset
    Then the preset "Default" should be selected
    And the preset dropdown should not contain "Cleanup"
    # Verify texture set is not associated to the deleted preset via API
    Then the model version should not have variant "Cleanup" in the API
