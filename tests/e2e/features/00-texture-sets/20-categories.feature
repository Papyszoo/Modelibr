@texture-set @texture-set-categories @serial
Feature: Texture Set Categories (per-kind)
  Categories are scoped per texture-set kind: Global Materials (Universal)
  and Multi-Model (ModelSpecific) keep separate category pools shown in the
  sidebar for the active kind. Management is inline via the sidebar's
  right-click context menu; a category created for one kind must not appear
  for the other, sets can be assigned to a category of their own kind, and
  clicking a category filters the grid to it.

  Scenario: A category created for Multi-Model is not shared with Global Materials
    Given I am on the texture sets page
    And I switch to the "Multi-Model" kind tab
    When I create a texture set category "mm-only" via the context menu
    Then the texture set category "mm-only" is visible in the sidebar
    When I switch to the "Global Materials" kind tab
    Then the texture set category "mm-only" is not visible in the sidebar

  Scenario: A category created for Global Materials is not shared with Multi-Model
    Given I am on the texture sets page
    And I switch to the "Global Materials" kind tab
    When I create a texture set category "gm-only" via the context menu
    Then the texture set category "gm-only" is visible in the sidebar
    When I switch to the "Multi-Model" kind tab
    Then the texture set category "gm-only" is not visible in the sidebar

  Scenario: Assign and filter a Multi-Model texture set by category
    Given I have a model-specific texture set category "mm-assign"
    And I have a model-specific texture set "mm-set"
    And I am on the texture sets page
    And I switch to the "Multi-Model" kind tab
    When I assign texture set "mm-set" to category "mm-assign"
    And I filter texture sets by category "mm-assign"
    Then texture set "mm-set" is visible in the grid

  Scenario: Assign and filter a Global Materials texture set by category
    Given I have a universal texture set category "gm-assign"
    And I have a universal texture set "gm-set"
    And I am on the texture sets page
    And I switch to the "Global Materials" kind tab
    When I assign texture set "gm-set" to category "gm-assign"
    And I filter texture sets by category "gm-assign"
    Then texture set "gm-set" is visible in the grid

  Scenario: Rename a texture set category
    Given I am on the texture sets page
    And I switch to the "Multi-Model" kind tab
    When I create a texture set category "rename-src" via the context menu
    And I rename the texture set category "rename-src" to "rename-dst" via the context menu
    Then the texture set category "rename-dst" is visible in the sidebar
    And the texture set category "rename-src" is not visible in the sidebar

  Scenario: Renaming a Multi-Model category to a name used by Global Materials is allowed
    Given I have a universal texture set category "xkind-shared"
    And I am on the texture sets page
    And I switch to the "Multi-Model" kind tab
    When I create a texture set category "xkind-src" via the context menu
    And I rename the texture set category "xkind-src" to "xkind-shared" via the context menu
    Then the texture set category "xkind-shared" is visible in the sidebar

  Scenario: Renaming a category to a duplicate name in the same kind is rejected
    Given I have a model-specific texture set category "rej-a"
    And I have a model-specific texture set category "rej-b"
    Then renaming category "rej-b" to "rej-a" is rejected

  Scenario: A colliding rename in the sidebar surfaces an error and keeps the original
    Given I have a model-specific texture set category "uirej-a"
    And I have a model-specific texture set category "uirej-b"
    And I am on the texture sets page
    And I switch to the "Multi-Model" kind tab
    Then renaming the texture set category "uirej-b" to "uirej-a" via the context menu surfaces an error
    And the texture set category "uirej-b" is visible in the sidebar

  Scenario: Delete a texture set category
    Given I am on the texture sets page
    And I switch to the "Multi-Model" kind tab
    When I create a texture set category "del-target" via the context menu
    And I delete the texture set category "del-target" via the context menu
    Then the texture set category "del-target" is not visible in the sidebar
