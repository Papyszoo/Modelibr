@batch3 @mcp @asset-search
Feature: Searching the asset library
    The derived search layer: how a freshly indexed model becomes findable, how
    near-identical and numbered copies are folded, how words are ranked, how a
    project's profile biases the results, and the read/curation tools around it.

    Models are provisioned through the API and the search index is polled until
    the derivation lands, so nothing here waits on a render.

    Scenario: A freshly indexed model is findable and stays findable after a reindex
        Given a batch3 search model exists
        Then searching for the batch3 search model's token should return it
        When an agent reindexes the library over MCP
        Then the reindex should report the library scope
        And searching for the batch3 search model's token should still return it

    Scenario: Numbered variants fold into one hit
        Given two batch3 search variant models exist
        Then searching for the variant stem should fold them into one hit

    Scenario: Identical geometry is collapsed within a search page
        Given two batch3 search duplicate models exist
        Then searching for the duplicate token should collapse them into one hit

    Scenario: A rarer word outranks a common one at equal coverage
        Given several batch3 search models carry a common token and one carries a rare token
        When an agent searches for the common and rare tokens together
        Then the first hit should be the model carrying the rare token

    Scenario: Tags and descriptions are searchable
        Given a batch3 search model with searchable metadata exists
        Then searching for its description token should return it
        And searching for its tag token should return it

    Scenario: A project's style ranks its matches and reports profile fit
        Given two batch3 styled search models exist
        And a batch3 search project styled "Low Poly" exists
        When an agent searches on behalf of the batch3 project for the styled token
        Then the first hit should be the low-poly search model
        And every hit should report a profile fit against the batch3 project

    Scenario: Size filters include and exclude by real-world size
        Given a batch3 search model exists
        When an agent searches for the batch3 search model's token with a maximum size of 0.5
        Then the search should return no hits
        When an agent searches for the batch3 search model's token with a minimum size of 0.5
        Then searching for the batch3 search model's token should return it

    Scenario: The facet vocabulary and ranges describe the filters
        When an agent lists the search facets
        Then the facet list should include the "uvStatus" filter
        When an agent asks for the facet ranges of models
        Then the facet ranges should include a triangle range

    Scenario: An agent reads a model's derived parts and one part
        Given a batch3 search model exists
        When an agent reads the batch3 search model over MCP
        Then the MCP asset read should list at least one part
        When an agent reads the first part over MCP
        Then the MCP part read should describe that part

    Scenario: search_many answers a batch of queries
        Given a batch3 search model exists
        When an agent runs a batch of two searches, one matching and one empty
        Then the batch should answer both entries with the registered labels

    Scenario: Duplicate detection finds and collapses same-geometry models
        Given two batch3 search duplicate models exist
        When an agent lists duplicate assets
        Then a duplicate group should contain both batch3 search duplicate models
        When an agent collapses the second duplicate as a dry run
        Then the dry run should not remove the second duplicate
        When an agent collapses the second duplicate for real
        Then the second duplicate should be recycled
        And the second duplicate should no longer be in a duplicate group

    Scenario: An agent files a model into a curated pack
        Given a batch3 search model exists
        When an agent creates a pack and adds the batch3 search model
        Then the pack should contain the batch3 search model

    Scenario: get_assets reads several assets in one call
        Given a batch3 search model exists
        When an agent reads a batch with the model and a missing asset
        Then the batch should answer the model and report the missing asset

    Scenario: Global search finds a sound and a sprite by a shared token
        Given I am on the model list page
        And a batch3 sound and a batch3 sprite share a token
        When I open the global search palette
        And I search the palette for that shared token
        Then the palette should show the batch3 sound and the batch3 sprite
