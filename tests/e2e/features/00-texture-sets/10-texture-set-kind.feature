@texture-set-kind
Feature: Texture Set Kind (Model-Specific vs Global Materials)

  Tests for the texture set kind feature including:
  - Kind filter tabs (Model-Specific and Global Materials)
  - Default tab is Global Materials
  - Creating texture sets with specific kind
  - Changing kind via API
  - Drag and drop between kind tabs
  - Thumbnail auto-generation on kind change to Universal
  - Context menu Regenerate Thumbnail visibility
  - Kind persistence and filtering

  Scenario: Default tab is Global Materials
    Given I am on the texture sets page
    Then the "Global Materials" kind tab should be active

  Scenario: Create Model-Specific texture set via API and verify it appears in correct tab
    Given I am on the texture sets page
    When I create a model-specific texture set "kind_test_ms" via API
    And I switch to the "Model-Specific" kind tab
    Then I should see texture set "kind_test_ms" in the grid
    When I switch to the "Global Materials" kind tab
    Then I should not see texture set "kind_test_ms" in the grid

  Scenario: Create Universal texture set via API and verify it appears in correct tab
    Given I am on the texture sets page
    When I create a universal texture set "kind_test_uni" via API
    And I switch to the "Global Materials" kind tab
    Then I should see texture set "kind_test_uni" in the grid
    When I switch to the "Model-Specific" kind tab
    Then I should not see texture set "kind_test_uni" in the grid

  Scenario: Change texture set kind from Model-Specific to Universal via API
    Given I am on the texture sets page
    When I create a model-specific texture set "kind_change_test" via API
    And I switch to the "Model-Specific" kind tab
    Then I should see texture set "kind_change_test" in the grid
    When I change texture set "kind_change_test" kind to Universal via API
    And I reload the page
    And I switch to the "Global Materials" kind tab
    Then I should see texture set "kind_change_test" in the grid
    When I switch to the "Model-Specific" kind tab
    Then I should not see texture set "kind_change_test" in the grid

  Scenario: Change texture set kind from Universal to Model-Specific via API
    Given I am on the texture sets page
    When I create a universal texture set "kind_revert_test" via API
    And I switch to the "Global Materials" kind tab
    Then I should see texture set "kind_revert_test" in the grid
    When I change texture set "kind_revert_test" kind to ModelSpecific via API
    And I reload the page
    And I switch to the "Model-Specific" kind tab
    Then I should see texture set "kind_revert_test" in the grid

  Scenario: Drag texture set from Model-Specific tab to Global Materials tab
    Given I am on the texture sets page
    When I create a model-specific texture set "drag_to_global" via API
    And I reload the page
    And I switch to the "Model-Specific" kind tab
    Then I should see texture set "drag_to_global" in the grid
    When I drag texture set "drag_to_global" to the "Global Materials" kind tab
    Then I should not see texture set "drag_to_global" in the grid
    When I switch to the "Global Materials" kind tab
    Then I should see texture set "drag_to_global" in the grid

  Scenario: Drag texture set from Global Materials tab to Model-Specific tab
    Given I am on the texture sets page
    When I create a universal texture set "drag_to_ms" via API
    And I reload the page
    And I switch to the "Global Materials" kind tab
    Then I should see texture set "drag_to_ms" in the grid
    When I drag texture set "drag_to_ms" to the "Model-Specific" kind tab
    Then I should not see texture set "drag_to_ms" in the grid
    When I switch to the "Model-Specific" kind tab
    Then I should see texture set "drag_to_ms" in the grid

  Scenario: Thumbnail auto-generated when kind changes to Universal
    Given I am on the texture sets page
    When I create a model-specific texture set "thumb_auto_gen" via API
    And I change texture set "thumb_auto_gen" kind to Universal via API
    Then texture set "thumb_auto_gen" should have a thumbnail via API

  Scenario: Context menu shows Regenerate Thumbnail for Universal sets
    Given I am on the texture sets page
    When I create a universal texture set "ctx_uni_regen" via API
    And I switch to the "Global Materials" kind tab
    And I right-click on texture set "ctx_uni_regen"
    Then I should see "Regenerate Thumbnail" in the context menu

  Scenario: Context menu hides Regenerate Thumbnail for Model-Specific sets
    Given I am on the texture sets page
    When I create a model-specific texture set "ctx_ms_no_regen" via API
    And I switch to the "Model-Specific" kind tab
    And I right-click on texture set "ctx_ms_no_regen"
    Then I should not see "Regenerate Thumbnail" in the context menu

  Scenario: Regenerate Thumbnail via context menu
    Given I am on the texture sets page
    When I create a universal texture set "ctx_regen_action" via API
    And I switch to the "Global Materials" kind tab
    And I right-click on texture set "ctx_regen_action"
    And I click "Regenerate Thumbnail" in the context menu
    Then I should see a success toast with "Thumbnail regeneration started"

  Scenario: Default tab persists after page reload
    Given I am on the texture sets page
    When I create a model-specific texture set "persist_ms" via API
    And I create a universal texture set "persist_uni" via API
    And I reload the page
    Then the "Global Materials" kind tab should be active
    And I should see texture set "persist_uni" in the grid

  Scenario: Kind filter via API returns correct results
    Given I am on the texture sets page
    When I create a model-specific texture set "api_filter_ms" via API
    And I create a universal texture set "api_filter_uni" via API
    Then the API should return texture set "api_filter_ms" for kind ModelSpecific
    And the API should return texture set "api_filter_uni" for kind Universal
    And the API should not return texture set "api_filter_ms" for kind Universal
    And the API should not return texture set "api_filter_uni" for kind ModelSpecific

  Scenario: Create Universal texture set with global texture files
    Given I am on the texture sets page
    When I create a universal texture set "global_tex_test" with global texture files via API
    And I reload the page
    And I switch to the "Global Materials" kind tab
    Then I should see texture set "global_tex_test" in the grid
    And texture set "global_tex_test" should have 4 textures via API
