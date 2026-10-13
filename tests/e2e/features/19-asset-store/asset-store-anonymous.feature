@infra @asset-store
Feature: Asset Store without an account
  Anyone can browse the store's public catalog and import a FREE pack without
  signing in - the same anonymous path the MCP agent import uses. Signing in
  stays available for paid packs and account features; it is not a gate on
  browsing or on free content. The store behind this is the store-fixture-e2e
  container, whose Guid-keyed assets are anonymous (server.mjs).

  Scenario: A signed-out visitor imports a free pack from the store catalog
    Given I am on the Asset Store tab without a store session
    Then the store catalog shows "E2E Free Props Pack" without a sign-in form
    When I open "2d3c4b5a-6e7f-4890-9a1b-2c3d4e5f6a7b" from the store catalog
    And I import "2d3c4b5a-6e7f-4890-9a1b-2c3d4e5f6a7b" from the store catalog without signing in
    Then no store import token was minted
    And the store import completes with an option to open the pack
    And the imported store pack "E2E Free Props Pack" contains the model "E2E Free Cube"

  Scenario: A free texture pack imports as texture sets with its category
    Given I am on the Asset Store tab without a store session
    Then the store catalog shows "E2E Texture Pack" without a sign-in form
    When I open "6f1e2d3c-4b5a-6978-8c9d-0e1f2a3b4c5d" from the store catalog
    And I import "6f1e2d3c-4b5a-6978-8c9d-0e1f2a3b4c5d" from the store catalog without signing in
    Then the store import completes with an option to open the pack
    And the imported texture pack "E2E Texture Pack" contains the texture set "E2E Brick Material"
    And the texture set "E2E Brick Material" holds the maps "brick_albedo.ktx2", "brick_normal.webp" and "brick_roughness.png" in the "E2E Store Textures" category
