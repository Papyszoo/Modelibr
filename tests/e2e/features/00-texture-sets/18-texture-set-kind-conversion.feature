@texture-set-conversion @depends-on:setup
Feature: Convert Texture Set Kind from the Materials Panel

  A texture set linked to a model can be converted between Multi-Model and
  Single Model kinds via the right-click context menu on its materials-item.
  Converting a Multi-Model set that is shared with other models warns the
  user and unlinks it from those models.

  Background:
    Given the following models exist in shared state:
      | name                 |
      | single-version-model |
      | multi-version-model  |

  Scenario: Context menu offers Single Model conversion for a Multi-Model set
    Given a Multi-Model texture set "conv_ctx_ms" linked to "single-version-model"
    And I am on the model viewer page for "single-version-model"
    When I right-click the material item for texture set "conv_ctx_ms"
    Then I should see "Convert to Single Model Texture Set" in the context menu

  Scenario: Context menu offers Multi-Model conversion for a Single Model set
    Given a Single Model texture set "conv_ctx_owned" linked to "single-version-model"
    And I am on the model viewer page for "single-version-model"
    When I right-click the material item for texture set "conv_ctx_owned"
    Then I should see "Convert to Multi-Model Texture Set" in the context menu

  Scenario: Convert a Multi-Model texture set to Single Model
    Given a Multi-Model texture set "conv_to_single" linked to "single-version-model"
    And I am on the model viewer page for "single-version-model"
    When I right-click the material item for texture set "conv_to_single"
    And I click "Convert to Single Model Texture Set" in the context menu
    Then texture set "conv_to_single" should have kind "Single Model" via API

  Scenario: Convert a Single Model texture set back to Multi-Model
    Given a Single Model texture set "conv_to_multi" linked to "single-version-model"
    And I am on the model viewer page for "single-version-model"
    When I right-click the material item for texture set "conv_to_multi"
    And I click "Convert to Multi-Model Texture Set" in the context menu
    Then texture set "conv_to_multi" should have kind "Multi-Model" via API

  Scenario: Converting a shared texture set warns and unlinks the other model
    Given a Multi-Model texture set "conv_shared" linked to "single-version-model"
    And texture set "conv_shared" is also linked to "multi-version-model"
    And I am on the model viewer page for "single-version-model"
    When I right-click the material item for texture set "conv_shared"
    And I click "Convert to Single Model Texture Set" in the context menu
    Then a conversion warning dialog should appear mentioning "multi-version-model"
    When I accept the conversion warning dialog
    Then texture set "conv_shared" should have kind "Single Model" via API
    And texture set "conv_shared" should not be linked to "multi-version-model" via API
