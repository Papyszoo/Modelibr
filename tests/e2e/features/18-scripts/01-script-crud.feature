@scripts @serial
Feature: Script CRUD and in-app authoring
  Upload, author, edit, categorize, associate, and recycle script assets.

  Scenario: Upload a script file
    Given I am on the scripts page
    When I upload a script named "e2e-upload-script" from "player_controller.lua"
    Then the script "e2e-upload-script" should be visible in the script list

  @authoring
  Scenario: Author a new script in-app and write code
    Given I am on the scripts page
    When I create a new script named "e2e-new-script" in language "Lua"
    And I write "-- hello from e2e" in the script editor and save
    Then the script "e2e-new-script" should be visible in the script list
    And the script "e2e-new-script" content should contain "hello from e2e"

  @authoring @description
  Scenario: Author a script with a description
    Given I am on the scripts page
    When I create a new script named "e2e-desc-script" in language "Lua" with description "Handles player input"
    And I write "-- described" in the script editor and save
    Then the script "e2e-desc-script" should be visible in the script list
    And the script "e2e-desc-script" card should show description "Handles player input"

  @preview
  Scenario: A shader script shows a live preview pane
    Given I am on the scripts page
    When I create a new script named "e2e-shader" in language "GLSL"
    Then the script editor preview pane should be visible

  @packs
  Scenario: Add a script to a pack
    Given I am on the scripts page
    And a script named "e2e-pack-script" exists
    And a pack named "e2e-script-pack" exists
    When I add the script "e2e-pack-script" to the pack "e2e-script-pack" via API
    Then the pack "e2e-script-pack" should contain the script "e2e-pack-script"

  @recycle
  Scenario: Recycle a script
    Given I am on the scripts page
    And a script named "e2e-recycle-script" exists
    When I recycle the script "e2e-recycle-script"
    Then the script "e2e-recycle-script" should not be visible in the script list
