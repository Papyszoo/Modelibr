@projects @project-agent-tools
Feature: Project tools for agents
    What an agent can do to a project over MCP: put library assets into it and
    take that back, link a model to a character, read the project's effects,
    and keep the project's comments - add, resolve, reopen, and list them by
    status or by what they are about.

    These are agent-only surfaces, so they are driven through the MCP endpoint
    the way an agent calls them and checked against the REST API the UI reads.

    Background:
        Given a comments project exists

    Scenario Outline: An agent adds a library <type> to the project and undoes it
        Given a library "<type>" named "<name>" exists
        When an agent adds the "<type>" "<name>" to the project
        Then the project should hold the "<type>" "<name>"
        When the agent reverses that add
        Then the project should not hold the "<type>" "<name>"

        Examples:
            | type            | name          |
            | model           | Agent Barrel  |
            | texture set     | Agent Bricks  |
            | sprite          | Agent Gem     |
            | sound           | Agent Bell    |
            | environment map | Agent Noon    |
            | VFX             | Agent Glimmer |

    Scenario: Undoing an add of an asset already in the project keeps it
        # The add changed nothing, so its undo must not remove a membership the
        # agent never made.
        Given the project has a "model" named "Kept Barrel"
        When an agent adds the "model" "Kept Barrel" to the project
        Then the agent should be told it was already in the project
        When the agent reverses that add
        Then the project should hold the "model" "Kept Barrel"

    Scenario: Linking a model to a character adds it to the project
        Given the project has a "character" named "Linked Ranger"
        And a library "model" named "Ranger Body" exists
        When an agent links the model "Ranger Body" to the character "Linked Ranger"
        Then the character "Linked Ranger" should list the model "Ranger Body"
        And the project should hold the "model" "Ranger Body"

    Scenario: The project brief lists the project's VFX
        Given the project has a "VFX" named "Brief Glow"
        When an agent reads the project
        Then the brief should list the VFX "Brief Glow"

    Scenario: An agent resolves a comment with a resolution and reopens it
        When an agent comments "Trim the intro" on the project
        Then the API should store "Trim the intro" as an open project-wide comment
        When the agent resolves "Trim the intro" with "Cut to ten seconds"
        Then the API should store the comment "Trim the intro" as resolved with "Cut to ten seconds"
        When the agent reopens "Trim the intro"
        Then the API should store the comment "Trim the intro" as open without a resolution

    Scenario: A resolution on an open comment is refused
        Given the project comment "Still open" exists
        When an agent records the resolution "Done" on the open comment "Still open"
        Then the agent should be refused with "InvalidProjectComment"
        When an agent reopens "Still open" with the resolution "Done"
        Then the agent should be refused with "InvalidProjectComment"
        And a REST update recording the resolution "Done" on the open comment "Still open" is refused
        And the API should store the comment "Still open" as open without a resolution

    Scenario: A comment names at most one target
        Given the project has a "level" named "Twin Level"
        And the project has a "character" named "Twin Hero"
        Then a REST comment on both the "level" "Twin Level" and the "character" "Twin Hero" is refused
        And the project should have no comments

    Scenario: An agent lists the project's comments by status
        Given the project comment "Open item" exists
        And the project comment "Closed item" exists resolved with "Handled"
        When an agent lists the project's "open" comments
        Then the agent should see only "Open item"
        When an agent lists the project's "resolved" comments
        Then the agent should see only "Closed item"

    Scenario Outline: An agent comments on the <target> and lists that target's comments
        Given the project has a "<target>" named "<name>"
        And the project comment "Unrelated remark" exists
        When an agent comments "<comment>" on the "<target>" "<name>"
        Then the API should store "<comment>" as a comment on the "<target>" "<name>"
        When an agent lists the project's comments on the "<target>" "<name>"
        Then the agent should see only "<comment>"

        Examples:
            | target          | name          | comment             |
            | level           | Filter Pier   | Pier needs lights   |
            | reference image | Filter Mood   | Match this contrast |
            | character       | Filter Keeper | Louder footsteps    |
            | model           | Filter Lamp   | Lamp too tall       |
            | texture set     | Filter Moss   | Moss tiles visibly  |
            | sprite          | Filter Arrow  | Arrow reads small   |
            | sound           | Filter Gong   | Gong clips          |
            | environment map | Filter Fog    | Fog too blue        |
            | VFX             | Filter Dust   | Dust lingers        |
