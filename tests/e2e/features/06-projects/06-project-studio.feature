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
