@agent-undo @mcp @batch1
Feature: Agent undo
    An agent's writes are recorded and reversible. This drives reverse_operation
    over the write kinds that record an operation and have an inverse, checks
    that a write with no inverse says so rather than claiming a reversal, and
    covers the recycle-bin round trip: delete_asset's dry run, the operator flag
    that gates a real delete, and restore_asset bringing an asset back.

    Each check reads the state back through REST, not the tool's own report.

    Scenario: An agent reverses a tag change on a model
        Given a reversible model exists
        When an agent sets the reversible model's tags to "undo-a, undo-b"
        Then the reversible model should store the tags "undo-a, undo-b"
        When an agent reverses the last undo write
        Then the reversible model should have no tags

    Scenario: An agent reverses a category change on a model
        Given a reversible model exists
        And a model category "Undo Category" exists
        When an agent sets the reversible model's category to "Undo Category"
        Then the reversible model should be in the provisioned category
        When an agent reverses the last undo write
        Then the reversible model should have no category

    Scenario: An agent reverses placing an asset in a scene
        Given a reversible model exists
        And an undo scene exists
        When an agent places the reversible model into the undo scene
        Then the undo scene should hold 1 node
        When an agent reverses the last undo write
        Then the undo scene should hold 0 nodes

    Scenario: An agent reverses adding a model to a pack
        Given a reversible model exists
        And a pack "Undo Pack" exists
        When an agent adds the reversible model to the pack
        Then the pack should contain the reversible model
        When an agent reverses the last undo write
        Then the pack should not contain the reversible model

    Scenario: A write with no inverse is reported rather than undone
        When an agent creates a non-reversible material
        When an agent asks to reverse the last undo write
        Then the reversal should report that no inverse exists

    Scenario: An agent restores a model recycled through the app
        Given a reversible model exists
        When the reversible model is recycled through the app
        Then the reversible model should be in the recycle bin
        When an agent restores the reversible model
        Then the reversible model should be back in the library

    Scenario: An agent checks a delete, and the stack refuses to apply it
        # delete_asset's apply path is gated by MCP_DESTRUCTIVE_ENABLED, which this
        # throwaway stack leaves off on purpose. The dry run is still covered, and
        # the refusal is the contract the stack's configuration promises.
        Given a reversible model exists
        When an agent asks to delete the reversible model
        Then the agent should be told it would recycle the model
        When an agent deletes the reversible model for real
        Then the agent should be told destructive work is disabled
