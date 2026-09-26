@projects @project-studio
Feature: Project Studio
  The production workspace above a project's asset sections: ordered levels,
  a level's assets derived from the scenes that place them, a character cast
  with abilities and level-scoped variants, and a reference board whose images
  link to levels and characters.

  Each scenario provisions through the API first and then navigates once, so no
  scenario depends on a second navigation landing on the same tab.

  Background:
    Given a studio project exists for the production workspace

  Scenario: Create a level with a description
    When I am on the studio project
    And I create the level "Forest Crossing" described as "Fog, rope bridges, and a bell tower"
    Then the level "Forest Crossing" should show its description

  Scenario: Create a character with role tags
    When I am on the studio project
    And I create the character "Ashen Warden" tagged "enemy, boss"
    Then the character "Ashen Warden" should show the "enemy" tag
    And the character "Ashen Warden" should be stored with its tags

  Scenario: Add an ability to a character
    Given a character named "Ashen Warden" exists
    When I am on the studio project
    And I add the ability "Ember lash" to character "Ashen Warden"
    Then character "Ashen Warden" should list the ability "Ember lash"
    And the API should record the ability "Ember lash" on character "Ashen Warden"

  Scenario: Add a level-scoped variant to a character
    Given a level named "Forest Crossing" exists
    And a character named "Ashen Warden" exists
    When I am on the studio project
    And I add the variant "Frozen" to character "Ashen Warden" for level "Forest Crossing"
    Then character "Ashen Warden" should list variant "Frozen" scoped to level "Forest Crossing"
    And the API should scope variant "Frozen" on character "Ashen Warden" to level "Forest Crossing"

  Scenario: Write an enemy weakness note
    Given a character named "Ashen Warden" exists
    When I am on the studio project
    And I add the note "Quenches under water" to character "Ashen Warden"
    Then character "Ashen Warden" should use the enemy notes area
    And character "Ashen Warden" should show the note "Quenches under water"

  Scenario: Add and title a reference image
    When I am on the studio project
    And I add a reference image to the board
    And I title the reference image "Misty crossing"
    Then the reference image should be titled "Misty crossing"

  Scenario: Link a reference image to a level
    Given a level named "Forest Crossing" exists
    When I am on the studio project
    And I add a reference image to the board
    And I link the reference image to level "Forest Crossing"
    Then the reference image should be linked to "Forest Crossing"
    And the API should link the reference image to "Forest Crossing"

  Scenario: Link a reference image to a character
    Given a character named "Ashen Warden" exists
    When I am on the studio project
    And I add a reference image to the board
    And I link the reference image to character "Ashen Warden"
    Then the reference image should be linked to "Ashen Warden"
    And the API should link the reference image to "Ashen Warden"

  Scenario: Unlink a level from a reference image
    Given a level named "Forest Crossing" exists
    When I am on the studio project
    And I add a reference image to the board
    And I link the reference image to level "Forest Crossing"
    And I unlink level "Forest Crossing" from the reference image
    Then the reference image should not be linked to "Forest Crossing"

  Scenario: Annotate a reference image
    When I am on the studio project
    And I add a reference image to the board
    And I add the note "Keep the horizon soft" to the reference image
    Then the reference image should show the note "Keep the horizon soft"

  Scenario: Remove a reference image without deleting the file
    When I am on the studio project
    And I add a reference image to the board
    And I remove the reference image from the project
    Then the reference board should be empty and the file should still exist

  Scenario: A level's assets come from the scenes that place them
    Given a level named "Forest Crossing" exists
    And a level named "Ruined Keep" exists
    And a scene "Crossing Layout" is linked to level "Forest Crossing" placing "Crossing Cube"
    And a scene "Crossing Detail" is linked to level "Forest Crossing" placing "Crossing Cube, Crossing Barrel"
    And a scene "Keep Approach" is linked to level "Ruined Keep" placing "Crossing Cube"
    When I am on the studio project
    And I show the level assets of "Forest Crossing"
    Then the level should place "Crossing Cube" exactly once
    And the level asset "Crossing Cube" should list the scene "Crossing Layout"
    And the level asset "Crossing Cube" should list the scene "Crossing Detail"
    And the level asset "Crossing Cube" should not list the scene "Keep Approach"
    And the level asset "Crossing Barrel" should list the scene "Crossing Detail"
    And the level asset "Crossing Barrel" should not list the scene "Crossing Layout"

  Scenario: A level keeps scene-placed assets apart from explicit project members
    Given a level named "Forest Crossing" exists
    And a scene "Crossing Layout" is linked to level "Forest Crossing" placing "Crossing Cube"
    And the model "Crossing Cube" is an explicit project member
    When I am on the studio project
    And I show the level assets of "Forest Crossing"
    Then the project member "Crossing Cube" should be listed apart from the placed assets

  @project-level-scene
  Scenario: A level opens its own scene, and makes one when it has none
    # The backend has filed scenes under levels since v0.7, and until now the
    # only way to reach that scene was the Scenes list - so the level was a dead
    # end in the UI and the journey could only be driven through the API. Both
    # halves of the button are asked here: a level with a scene opens it, and a
    # level without one gets one filed under it and opened.
    Given a level named "Forest Crossing" exists
    And a level named "Ruined Keep" exists
    When I am on the studio project
    And I press the scene control of the level "Forest Crossing"
    Then the scene editor for "Forest Crossing" should be in its own tab
    When I press the scene control of the level "Ruined Keep"
    Then the scene editor for "Ruined Keep" should be in its own tab
    And the scene "Ruined Keep" should be filed under that level

  @project-level-workspace
  Scenario: A level is a workspace of its own, reached from the project
    # The release intent is "open a Project, work one Level at a time". A level
    # row that only answered "what is this project" left the level itself with
    # nowhere to go, so the row opens one and the breadcrumb is the way back. The
    # two assertions that matter: the level's own four surfaces replace the
    # project's, and going back leaves the project where it was.
    Given a level named "Workspace Crossing" exists
    When I am on the studio project
    And I open the level "Workspace Crossing"
    Then the level workspace should be showing "Workspace Crossing"
    And the level workspace should offer its own four surfaces
    When I go back to the project from the level
    Then the project workspace should be showing its own four surfaces

  @project-level-brief
  Scenario: A level's brief and counts answer without opening anything
    # The variant count came back from the API the whole time and the row never
    # showed it. A level card is a summary, so what a level already has on it -
    # its description, its cast, how much is built - is the summary.
    Given a level named "Brief Forest" exists
    And a level named "Brief Keep" exists
    When I am on the studio project
    Then the level row "Brief Forest" should show its description
    And the level row "Brief Keep" should offer to open a workspace

  @project-level-brief-cast
  Scenario: A level's workspace names the cast that changes in it
    # A variant is how a character is different in this level than another, so
    # "which variants does this level use" is a question the level answers. The
    # count came from the level DTO all along; nothing displayed it.
    Given a level named "Cast Crossing" exists
    And a character named "Cast Warden" exists
    And a variant "Frozen" of character "Cast Warden" is scoped to level "Cast Crossing"
    When I am on the studio project
    And I open the level "Cast Crossing"
    Then the level workspace should list 1 character variant
    And the level workspace should name the variant "Frozen"

  @project-level-scenes-view
  Scenario: A level's scenes are listed, with the primary one marked
    # A level may hold several scenes: one primary shot plus alternates. Which is
    # which is the information needed before opening either, so the primary is
    # marked rather than sorted to the top and left anonymous. The first scene
    # filed claims primary; a later one must not steal it.
    Given a level named "Scenes Crossing" exists
    And a scene "Scenes Layout" is linked to level "Scenes Crossing" placing "Scenes Cube"
    And a scene "Scenes Alternate" is linked to level "Scenes Crossing" placing "Scenes Barrel"
    When I am on the studio project
    And I open the level "Scenes Crossing"
    And I show the scenes of the level
    Then the level should list 2 scenes
    And the level scene "Scenes Layout" should be marked primary
    And the level scene "Scenes Alternate" should not be marked primary

  @project-level-assets-view
  Scenario: A level's assets view is scoped to that level
    # The project view offers a picker over every level; the level's own Assets
    # view must not, or the user could filter their way out of the level they
    # opened. Same derivation either way, so the two cannot disagree.
    Given a level named "Assets Crossing" exists
    And a scene "Assets Layout" is linked to level "Assets Crossing" placing "Assets Cube"
    When I am on the studio project
    And I open the level "Assets Crossing"
    And I show the assets of the level
    Then the level should place "Assets Cube"
    And the level assets should offer no level picker

  @project-level-missing
  Scenario: A level deleted while its workspace is open says so and leaves a way out
    # A workspace reached by drill-down can outlive the thing it drills into. The
    # level is gone; the project, its other levels and the open scenes are not, so
    # the honest answer is to say it and offer the way back.
    Given a level named "Vanishing Level" exists
    When I am on the studio project
    And I open the level "Vanishing Level"
    And the level "Vanishing Level" is deleted
    Then the missing-level notice should be shown
    When I go back to the project from the level
    Then the project workspace should be showing its own four surfaces
