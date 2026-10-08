@projects @project-comments
Feature: Project comments
    A project keeps comments: on the project itself, or on one thing in it - a
    level, a reference image, a character, or a library asset the project
    holds. A comment is open until someone resolves it, optionally saying what
    changed, and a resolved one can be reopened. A pinned comment is one of the
    project's decisions.

    Every element's card carries a badge counting its OPEN comments, so the
    count is what still needs doing rather than everything ever said.

    Background:
        Given a comments project exists

    Scenario: Add a project-wide comment from the overview
        When I open the comments project
        And I add the project comment "Tone down the fog"
        Then the overview should list the comment "Tone down the fog" about "Project"
        And the API should store "Tone down the fog" as an open project-wide comment

    Scenario: Edit a project comment
        Given the project comment "Lighting pass" exists
        When I open the comments project
        And I edit the overview comment "Lighting pass" to "Lighting pass two" saying "Warmer key light"
        Then the overview should list the comment "Lighting pass two" about "Project"
        And the API should store the comment "Lighting pass two" with the body "Warmer key light"

    Scenario: Pin a comment as a decision and unpin it
        Given the project comment "Palette choice" exists
        When I open the comments project
        And I pin the overview comment "Palette choice" as a decision
        Then the overview comment "Palette choice" should be marked as a decision
        And the API should store the comment "Palette choice" as pinned
        When I unpin the overview comment "Palette choice"
        Then the overview comment "Palette choice" should not be marked as a decision
        And the API should store the comment "Palette choice" as not pinned

    Scenario: Resolve a comment with a resolution
        Given the project comment "Door too narrow" exists
        And the project comment "Railing missing" exists
        When I open the comments project
        And I resolve the overview comment "Door too narrow" with "Widened to two metres"
        Then the overview comment "Door too narrow" should be resolved with "Widened to two metres"
        And the overview comment "Door too narrow" should be de-emphasised
        And the resolved comment "Door too narrow" should be listed after the open comment "Railing missing"
        And the API should store the comment "Door too narrow" as resolved with "Widened to two metres"

    Scenario: Resolve a comment without a resolution
        Given the project comment "Sign typo" exists
        When I open the comments project
        And I resolve the overview comment "Sign typo" without a resolution
        Then the overview comment "Sign typo" should be resolved without a resolution
        And the API should store the comment "Sign typo" as resolved without a resolution

    Scenario: Reopening a comment clears its resolution
        Given the project comment "Too dark" exists resolved with "Raised exposure"
        When I open the comments project
        And I reopen the overview comment "Too dark"
        Then the overview comment "Too dark" should be open without a resolution
        And the API should store the comment "Too dark" as open without a resolution

    Scenario Outline: Comment on the <target> from its own card
        # Each card's badge opens the same thread, scoped to that card, and its
        # count follows the comment through resolve and reopen.
        Given the project has a "<target>" named "<name>"
        When I open the comments project
        And I comment "<comment>" on the "<target>" "<name>" from its badge
        Then the comments badge of "<name>" should count 1 open comment
        And the API should store "<comment>" as a comment on the "<target>" "<name>"
        When I resolve "<comment>" in the comments panel of "<name>"
        Then the comments badge of "<name>" should count 0 open comments
        When I reopen "<comment>" in the comments panel of "<name>"
        Then the comments badge of "<name>" should count 1 open comment

        Examples:
            | target          | name             | comment           |
            | model           | Comment Crate    | Bevel the corners |
            | texture set     | Comment Planks   | Less saturated    |
            | sprite          | Comment Coin     | Add a glint frame |
            | sound           | Comment Chime    | Shorter tail      |
            | environment map | Comment Dusk     | Lower the sun     |
            | VFX             | Comment Sparks   | Fewer particles   |
            | level           | Comment Harbour  | Add a second exit |
            | character       | Comment Sentinel | Slower windup     |

    Scenario: Comment on a reference image from its card
        # The reference card shows its thread inline rather than behind a badge,
        # so its open count is the thread's own.
        Given the project has a "reference image" named "Comment Skyline"
        When I open the comments project
        And I comment "Keep the haze" on the reference image "Comment Skyline"
        Then the reference image "Comment Skyline" should count 1 open comment
        And the API should store "Keep the haze" as a comment on the "reference image" "Comment Skyline"
        When I resolve "Keep the haze" on the reference image "Comment Skyline"
        Then the reference image "Comment Skyline" should count 0 open comments
        When I reopen "Keep the haze" on the reference image "Comment Skyline"
        Then the reference image "Comment Skyline" should count 1 open comment

    Scenario: Add a VFX to a project from its VFX tab
        Given a library "VFX" named "Project Embers" exists
        When I open the comments project
        And I add the VFX "Project Embers" from the project's VFX tab
        Then the project's VFX tab should list "Project Embers"
        And the project's VFX tab should count 1 effect
        And the project should hold the "VFX" "Project Embers"

    Scenario: Remove a VFX from a project
        Given the project has a "VFX" named "Project Smoke"
        When I open the comments project
        And I remove the VFX "Project Smoke" from the project's VFX tab
        Then the project's VFX tab should count 0 effects
        And the project should not hold the "VFX" "Project Smoke"

    Scenario: Deleting a character moves its comments to the project
        Given the project has a "character" named "Retired Scout"
        And the "character" "Retired Scout" has the comment "Too fast on stairs"
        When I open the comments project
        And I delete the character "Retired Scout"
        Then the overview should list the comment "Too fast on stairs" about "Project"
        And the API should store "Too fast on stairs" as a project-wide comment

    Scenario Outline: Deleting a commented <target> leaves the comment on the project
        Given the project has a "<target>" named "<name>"
        And the "<target>" "<name>" has the comment "<comment>"
        When the "<target>" "<name>" is deleted from the library
        And I open the comments project
        Then the overview should list the comment "<comment>" about "Project"
        And the API should store "<comment>" as a project-wide comment

        Examples:
            | target | name        | comment         |
            | VFX    | Spent Flare | Dim the flash   |
            | model  | Spent Crate | Fewer polygons  |
