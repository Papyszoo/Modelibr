@texture-set @texture-set-categories @serial
Feature: Texture Set Categories (per-kind)
  Categories are scoped per texture-set kind: Global Materials (Universal)
  and Multi-Model (ModelSpecific) keep separate category pools. A category
  created for one kind must not appear for the other, sets can be assigned
  to a category of their own kind, and the grid can be filtered by it.

  Scenario: A category created for Multi-Model is not shared with Global Materials
    Given I am on the texture sets page
    And I switch to the "Multi-Model" kind tab
    When I open the category manager
    And I create the category "mm-only"
    Then the category "mm-only" is listed in the manager
    When I close the category manager
    And I switch to the "Global Materials" kind tab
    And I open the category manager
    Then the category "mm-only" is not listed in the manager

  Scenario: A category created for Global Materials is not shared with Multi-Model
    Given I am on the texture sets page
    And I switch to the "Global Materials" kind tab
    When I open the category manager
    And I create the category "gm-only"
    Then the category "gm-only" is listed in the manager
    When I close the category manager
    And I switch to the "Multi-Model" kind tab
    And I open the category manager
    Then the category "gm-only" is not listed in the manager

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
    When I open the category manager
    And I create the category "rename-src"
    And I rename the category "rename-src" to "rename-dst"
    Then the category "rename-dst" is listed in the manager
    And the category "rename-src" is not listed in the manager

  Scenario: Renaming a Multi-Model category to a name used by Global Materials is allowed
    Given I have a universal texture set category "xkind-shared"
    And I am on the texture sets page
    And I switch to the "Multi-Model" kind tab
    When I open the category manager
    And I create the category "xkind-src"
    And I rename the category "xkind-src" to "xkind-shared"
    Then the category "xkind-shared" is listed in the manager

  Scenario: Renaming a category to a duplicate name in the same kind is rejected
    Given I have a model-specific texture set category "rej-a"
    And I have a model-specific texture set category "rej-b"
    Then renaming category "rej-b" to "rej-a" is rejected

  Scenario: Delete a texture set category
    Given I am on the texture sets page
    And I switch to the "Multi-Model" kind tab
    When I open the category manager
    And I create the category "del-target"
    And I delete the texture set category "del-target"
    Then the category "del-target" is not listed in the manager
