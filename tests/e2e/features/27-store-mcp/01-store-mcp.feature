@batch3 @mcp @store-mcp @infra
Feature: The companion Asset Store
    The store is optional, and this stack runs a stand-in it and the backend can
    both reach (store-fixture-e2e plus STORE_URL). Covered here are the browser
    sign-in surface the UI owns and the agent catalog path over MCP: search,
    read, import, and the import job poll, plus the honest answer a missing job
    still gives.

    Scenario: The store login form reports a rejected sign-in
        Given I am on the Asset Store tab
        When I sign in to the store with the wrong password
        Then the store login error should say "Invalid email or password."

    Scenario: An agent searches the store catalog and reads a hit
        When an agent searches the store catalog over MCP for "Catalog"
        Then the store catalog should list the catalog asset
        When an agent reads the catalog hit over MCP
        Then the store asset detail should describe the catalog asset

    Scenario: An agent imports a free store asset into the library
        Given an agent reads the catalog asset over MCP
        When an agent imports the catalog asset over MCP
        Then the store import job should complete
        And the imported catalog asset should be in the library with its metadata
        And the catalog hit should report it is already imported

    Scenario: An agent reads a store import job over MCP
        When an agent reads a store import job over MCP
        Then the store import job should be reported missing
