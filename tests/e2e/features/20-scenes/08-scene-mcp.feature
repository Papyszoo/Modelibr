@batch2 @scenes @scene-mcp
Feature: Scene tools for agents
    What an agent can do to a scene over MCP: create it, place library assets
    and every primitive shape, build a room, move, distribute and remove nodes,
    light it, stage it, keep its document, validate it, run its slots - propose,
    read, recommend, resolve, reject - ask which scenes use an asset, and delete
    it.

    These are agent-only surfaces, so they are driven through the MCP endpoint
    the way an agent calls them and checked against the REST API the editor
    reads.

    Background:
        Given a scene MCP model exists

    Scenario: An agent creates a scene, lists it and reads it back
        When an agent creates a scene over MCP
        Then the MCP scene list should include that scene
        And the MCP scene read should report that scene with 0 nodes

    Scenario: An agent places an asset and moves it
        Given an agent-created scene exists
        When an agent places the scene MCP model in the scene
        Then the scene should hold 1 nodes over REST
        And the MCP placement should pin the model's version
        When an agent moves the placed node to x 2.5
        Then the scene's first node should sit at x 2.5 over REST

    Scenario: An agent rests one asset on another
        # The placement rules a write records: a node that rests on another follows
        # it, so the anchor is a durable fact of the document, not a one-off Y.
        Given an agent-created scene exists
        When an agent places the scene MCP model in the scene
        And an agent places a second model resting on the first
        Then the second node should rest on the first over REST

    Scenario: An agent places several assets in one batch
        Given an agent-created scene exists
        When an agent places a batch of 2 models in the scene
        Then the scene should hold 2 nodes over REST
        And the MCP batch should report 2 nodes

    Scenario: An agent distributes copies of one asset along a line
        Given an agent-created scene exists
        When an agent distributes 3 copies of the scene MCP model from x 0 to x 4
        Then the scene should hold 3 nodes over REST
        And the MCP distribution should report 3 nodes
        And the scene's nodes should sit at x 0, 2 and 4

    Scenario Outline: An agent places a <shape> primitive
        Given an agent-created scene exists
        When an agent places a "<shape>" primitive
        Then the scene's first node should be a "<shape>" primitive

        Examples:
            | shape    |
            | box      |
            | plane    |
            | sphere   |
            | cylinder |
            | cone     |

    Scenario: An agent builds a room shell
        Given an agent-created scene exists
        When an agent creates a room 4 by 3 by 2.5
        Then the scene should hold the parts of a room

    Scenario: An agent lights a scene with a preset and edits one light
        Given an agent-created scene exists
        When an agent applies the "studio" lighting preset
        Then the scene should have a key light
        When an agent sets a "spot" light named "key"
        Then the scene's light "key" should be a "spot"
        When an agent removes the light "key"
        Then the scene should have no light "key"

    Scenario: An agent removes a placed node
        Given an agent-created scene with one placed model exists
        When an agent removes the placed node
        Then the scene should hold 0 nodes over REST
        And the MCP removal should report the removed node

    Scenario: An agent replaces a scene document
        Given an agent-created scene exists
        When an agent replaces the scene document with a blockout box
        Then the scene should hold a blockout box over REST
        And the MCP document update should be reflected

    # @serial: this scenario waits for the asset processor to derive a freshly uploaded
    # model. One render slot is shared worker-wide, so on the untagged parallel lane that
    # derivation queues behind every render job in flight and the wait can outlast the
    # test's whole budget - the scenario failed on load alone, not on behavior. The serial
    # lane's queue is shallow, and the wait's budget covers the rest. Drop @serial if
    # derivation ever stops going through that render slot.
    @serial @timeout:240000
    Scenario: An agent validates a scene with a floating node
        Given an agent-created scene exists
        And the scene MCP model has derived bounds
        When an agent places the scene MCP model in the scene
        And an agent lifts the placed node 5 m into the air
        And an agent validates the scene over MCP
        Then the MCP validation should report "Contact.Unsupported"
        And the MCP validation should name its blind spots

    Scenario: An agent stages a scene and clears the stage
        Given an agent-created scene exists
        When an agent sets the scene stage to "layout"
        Then the MCP scene should report the "layout" stage
        When an agent clears the scene stage
        Then the MCP scene should report no stage

    Scenario: An agent proposes candidates and reads the slots
        Given an agent-created scene exists
        And the scene MCP model is placed for the slot "streetlight"
        When an agent proposes two candidates for the slot "streetlight"
        Then the MCP slot "streetlight" should offer 3 candidates
        And the MCP slots should list the slot "streetlight" with 3 candidates

    Scenario: An agent resolves a slot on a candidate
        Given an agent-created scene exists
        And the scene MCP model is placed for the slot "streetlight"
        And two candidates have been proposed over MCP for the slot "streetlight"
        When an agent resolves the slot "streetlight" on candidate "B"
        Then the MCP slot "streetlight" should be chosen as "B" by "agent"

    Scenario: An agent rejects every candidate in a slot
        Given an agent-created scene exists
        And the scene MCP model is placed for the slot "streetlight"
        And two candidates have been proposed over MCP for the slot "streetlight"
        When an agent rejects every candidate in the slot "streetlight" saying "all too modern"
        Then the MCP slot "streetlight" should record "all too modern" against every candidate

    Scenario: An agent recommends a candidate without choosing it
        Given an agent-created scene exists
        And the scene MCP model is placed for the slot "streetlight"
        And two candidates have been proposed over MCP for the slot "streetlight"
        When an agent recommends candidate "B" for the slot "streetlight" saying "matches the brief best"
        Then the MCP slot "streetlight" should recommend "B" with the summary "matches the brief best"
        And the MCP slot "streetlight" should remain open

    # @serial: same asset-processor wait as the floating-node scenario above - the measured
    # candidate cards need the model's derived facts, and the parallel lane can starve that
    # derivation behind renders.
    @serial @timeout:240000
    Scenario: Candidate cards are measured against the project profile
        Given a batch2 project with a per-asset budget exists
        And an agent-created scene exists
        And the scene is linked to the batch2 project
        And the scene MCP model has derived bounds
        And the scene MCP model is placed for the slot "streetlight"
        When an agent proposes two candidates for the slot "streetlight"
        Then the MCP slot candidates should be measured against the project
        And the MCP scene read should carry the project brief

    Scenario: An agent asks which scenes use an asset
        Given an agent-created scene with one placed model exists
        When an agent asks which scenes use the scene MCP model
        Then the MCP usage should list that scene

    Scenario: An agent checks a scene deletion that the stack refuses to apply
        # delete_scene's apply path is gated by MCP_DESTRUCTIVE_ENABLED, which this
        # throwaway stack leaves off on purpose. The dry run is still covered, and
        # the refusal is the contract the stack's configuration promises.
        Given an agent-created scene exists
        When an agent asks to delete the scene over MCP
        Then the agent should be told the scene would be deleted
        When an agent deletes the scene over MCP for real
        Then the agent should be told scene deletion is disabled
        And the scene should still exist over REST
