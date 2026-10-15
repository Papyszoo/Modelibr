@projects @project-mcp-tools @batch1
Feature: Project tools for agents
    The project surface an agent reads and writes over MCP: the project list and
    its brief, the levels and characters a project holds, the profile vocabulary
    it is described by, and the writes that put a level, a character, a
    reference image or a scene into it - each checked against the REST state the
    UI reads.

    These are agent-only surfaces, so they are driven through the MCP endpoint
    the way an agent calls them.

    Background:
        Given an MCP project exists

    Scenario: An agent lists the projects and sees this one
        Given the MCP project profile is style "Low Poly" and platform "Meta Quest"
        When an agent lists projects over MCP
        Then the MCP project list should include this project
        And the MCP project summary should list the style "Low Poly" and the platform "Meta Quest"

    Scenario: An agent reads the project brief
        Given the MCP project profile is style "Low Poly" and platform "Meta Quest"
        When an agent reads the project brief over MCP
        Then the MCP brief should list the style "Low Poly"
        And the MCP brief should suggest the "Meta Quest" budget
        And the MCP brief guidance should mention the style "Low Poly"
        And the MCP brief style signals should boost "low poly"

    Scenario: An agent lists a project's levels
        Given the MCP project has a level "MCP Forest"
        When an agent lists the project levels over MCP
        Then the MCP levels should include "MCP Forest"

    Scenario: An agent lists a project's characters
        Given the MCP project has a character "MCP Scout"
        When an agent lists the project characters over MCP
        Then the MCP characters should include "MCP Scout"

    Scenario: An agent lists a project's profile options
        When an agent lists the project profile options for "style"
        Then the MCP profile options should include the built-in "style" "Low Poly"

    Scenario: An agent creates and updates a project level
        When an agent adds a project level "MCP Gate" described "North gate"
        And an agent lists the project levels over MCP
        Then the MCP levels should show "MCP Gate" with status "planned"
        When an agent updates the project level "MCP Gate" to status "in_progress"
        And an agent lists the project levels over MCP
        Then the MCP levels should show "MCP Gate" with status "in_progress"

    Scenario: An agent creates and updates a project character
        When an agent adds a project character "MCP Runner" tagged "npc"
        And an agent lists the project characters over MCP
        Then the MCP characters should show "MCP Runner" tagged "npc"
        When an agent updates the project character "MCP Runner" to tag "enemy"
        And an agent lists the project characters over MCP
        Then the MCP characters should show "MCP Runner" tagged "enemy"

    Scenario: An agent adds a reference image to the project
        Given an uploaded reference image exists
        When an agent adds a project reference titled "MCP Mood" with the comment "Match this contrast"
        Then the project references should include the title "MCP Mood"
        And the MCP brief should list the reference image for that file

    Scenario: An agent links a scene to a project and undoes the link
        Given a standalone scene exists
        When an agent links the standalone scene to the MCP project
        Then the standalone scene should belong to the MCP project
        When an agent reverses the last MCP write
        Then the standalone scene should belong to no project

    Scenario: An agent unlinks a scene from its project
        Given a standalone scene exists
        And an agent links the standalone scene to the MCP project
        When an agent unlinks the standalone scene from its project
        Then the standalone scene should belong to no project
