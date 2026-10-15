@batch2 @vfx @vfx-mcp
Feature: VFX tools for agents
    An effect is a small authored document, so an agent needs to create one,
    read it back in full, browse the list and change it - including having an
    invalid definition returned with the path of the field it is about rather
    than stored broken.

    Scenario: An agent creates a VFX and reads it back
        When an agent creates a VFX named "Agent Sparks" over MCP
        Then the MCP VFX read should name it "Agent Sparks" with duration 2
        And the MCP VFX list should include it

    Scenario: An agent updates a VFX
        Given an agent-created VFX named "Agent Update" exists
        When an agent updates that VFX to duration 3
        Then the MCP VFX read should report duration 3

    Scenario: An invalid VFX duration is refused with the path of the field
        Given an agent-created VFX named "Agent Invalid" exists
        When an agent updates that VFX to the invalid duration 0.05
        Then the MCP VFX update should be refused with "InvalidVfxDefinition"
        And the MCP VFX problems should name the path "duration"
        And the stored VFX should still have duration 2
