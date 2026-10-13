@batch3 @mcp @import-metadata
Feature: Import and asset metadata
    How assets get into the library and what they then say about themselves:
    the upload-ticket data plane an agent uses for every family, the
    automation that categorises an import and the review that settles it, the
    structured metadata schema, and the two async tools that rebuild an
    asset's derivation and compute an expensive metric.

    These are agent-only surfaces, so they are driven through the MCP endpoint
    the way an agent calls them and checked against the REST API the UI reads.

    Scenario: An agent imports a model through an upload ticket
        When an agent requests a "Model" upload ticket
        Then the upload ticket should target "POST /models"
        When the agent uploads a unique model with that ticket
        Then the library should hold the model imported through the ticket
        And the MCP upload contract should offer the loose-glTF alternative

    Scenario: An agent imports a sound, sprite, environment map and texture set through upload tickets
        When an agent imports a sound through an upload ticket
        Then the library sound imported through the ticket should exist
        When an agent imports a sprite through an upload ticket
        Then the library sprite imported through the ticket should exist
        When an agent imports an environment map through an upload ticket
        Then the library environment map imported through the ticket should exist
        When an agent imports a texture set through an upload ticket
        Then the library texture set imported through the ticket should exist

    Scenario Outline: An import tool refuses a path the server cannot read
        When an agent calls "<tool>" for "<assetType>" with an unreadable server path
        Then the agent should be told the path was not found

        Examples:
            | tool               | assetType      |
            | import_model       | Model          |
            | import_asset       | Sound          |
            | import_asset       | Sprite         |
            | import_asset       | EnvironmentMap |
            | import_texture_set | TextureSet     |

    Scenario: An automatically classified import can be rejected
        Given a batch3 model named like a chair exists
        Then the import suggestions should offer a category for that model
        When an agent rejects the import suggestions for that model
        Then the import suggestions should no longer offer that model
        And that model should have no category

    Scenario: The model list banner reviews and keeps an automatic category
        Given a batch3 model named like a chair exists
        And the import suggestions should offer a category for that model
        When I open the model list
        Then the import suggestions banner should be visible
        When I open the import suggestions review
        Then the review dialog should offer that model
        When I keep that suggestion in the dialog
        Then that model should keep its automatic category
        And the import suggestions should no longer offer that model

    Scenario: Structured metadata is written, read back and gap-filled by annotation
        Given a batch3 model named like a table exists
        When an agent sets structured metadata on that model
        Then the metadata schema should describe the license field
        And that model's metadata should carry the structured fields
        When an agent annotates that model with a different description and tags
        Then that model should keep the authored description
        And that model should carry the annotation tags

    Scenario: An agent sets tags and a category on a model
        Given a batch3 model named like a lamp exists
        And a batch3 model category "Batch3 Props" exists
        When an agent sets that model's tags to "batch3-tag-a, batch3-tag-b"
        Then that model should store the tags "batch3-tag-a, batch3-tag-b"
        When an agent sets that model's category to the batch3 category
        Then that model should be filed under the batch3 category

    Scenario: The metadata panel edits a structured field
        Given a batch3 model named like a crate exists
        When I open the metadata panel for that model
        And I set the metadata license to "CC0" and save
        Then the API should store that model's license as "CC0"

    Scenario: compute_on_demand answers a metric or refuses a layout metric
        When an agent asks for the surface-area metric of an unknown geometry
        Then the compute result should be pending
        When an agent asks for the UV-overlap metric of that geometry
        Then the compute tool should say the metric depends on the UV layout

    Scenario: An agent queues a re-derivation idempotently
        Given a batch3 model named like a barrel exists
        When an agent triggers a re-derivation of that model
        Then the re-derivation should be queued with a job id
        When an agent triggers the same re-derivation with the same key
        Then the re-derivation should report it was already applied
