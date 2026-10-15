@infra @asset-store
Feature: Asset Store import
  A user signs into the companion asset store from the Asset Store tab,
  sees their store library, and imports a pack into the local instance.
  The store is the store-fixture-e2e container (docker-compose.e2e.yml);
  the LOCAL backend pulls the pack's files from it server-to-server.

  Scenario: Import a pack from the store library into the local instance
    Given I am on the Asset Store tab
    When I sign in to the asset store
    Then my store library shows "E2E Props Pack"
    When I open "e2e-props-pack" from the store library
    Then clicking an item's checkbox deselects and reselects that item
    When I import "e2e-props-pack" from the store library
    Then the store import completes with an option to open the pack
    And opening the imported pack shows the pack viewer for "E2E Props Pack"
    And the imported pack "E2E Props Pack" contains the model "E2E Test Cube" with store provenance
    And the imported model "E2E Test Cube" is filed under the "Props" model category

  Scenario: An imported model opens on its own embedded materials
    # A store item arrives dressed: its materials are inside the file, and the
    # thumbnail the import reuses is the store's own render of that dressed
    # asset. The version is seeded with the embedded-materials preset when it is
    # created, so the viewer opens on the model's own materials - not on the
    # clay "Default" preset its card never showed. A re-import dedupes onto the
    # first scenario's model, which is where that preset is read from.
    Given I am on the Asset Store tab
    When I sign in to the asset store
    And I open "e2e-props-pack" from the store library
    When I import "e2e-props-pack" from the store library
    Then the store import completes with an option to open the pack
    When I open the imported model viewer for "E2E Test Cube"
    Then the preset "Embedded" should be selected
