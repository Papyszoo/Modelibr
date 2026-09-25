@projects @project-studio
Feature: Project Studio
  The production workspace above a project's asset sections: ordered levels,
  a character cast with abilities and level-scoped variants, and a reference
  board whose images link to levels and characters.

  Background:
    Given a studio project exists for the production workspace
    And I am on the studio project

  Scenario: Create a level with a description
    When I create the level "Forest Crossing" described as "Fog, rope bridges, and a bell tower"
    Then the level "Forest Crossing" should show its description

  Scenario: Create a character with role tags
    When I create the character "Ashen Warden" tagged "enemy, boss"
    Then the character "Ashen Warden" should show the "enemy" tag
    And the character "Ashen Warden" should be stored with its tags

  Scenario: Add an ability to a character
    Given a character named "Ashen Warden" exists
    When I add the ability "Ember lash" to character "Ashen Warden"
    Then character "Ashen Warden" should list the ability "Ember lash"
    And the API should record the ability "Ember lash" on character "Ashen Warden"

  Scenario: Add a level-scoped variant to a character
    Given a level named "Forest Crossing" exists
    And a character named "Ashen Warden" exists
    When I add the variant "Frozen" to character "Ashen Warden" for level "Forest Crossing"
    Then character "Ashen Warden" should list variant "Frozen" scoped to level "Forest Crossing"
    And the API should scope variant "Frozen" on character "Ashen Warden" to level "Forest Crossing"

  Scenario: Write an enemy weakness note
    Given a character named "Ashen Warden" exists
    When I add the note "Quenches under water" to character "Ashen Warden"
    Then character "Ashen Warden" should use the enemy notes area
    And character "Ashen Warden" should show the note "Quenches under water"

  Scenario: Add and title a reference image
    When I add a reference image to the board
    And I title the reference image "Misty crossing"
    Then the reference image should be titled "Misty crossing"

  Scenario: Link a reference image to a level
    Given a level named "Forest Crossing" exists
    When I add a reference image to the board
    And I link the reference image to level "Forest Crossing"
    Then the reference image should be linked to "Forest Crossing"
    And the API should link the reference image to "Forest Crossing"

  Scenario: Link a reference image to a character
    Given a character named "Ashen Warden" exists
    When I add a reference image to the board
    And I link the reference image to character "Ashen Warden"
    Then the reference image should be linked to "Ashen Warden"
    And the API should link the reference image to "Ashen Warden"

  Scenario: Unlink a level from a reference image
    Given a level named "Forest Crossing" exists
    When I add a reference image to the board
    And I link the reference image to level "Forest Crossing"
    And I unlink level "Forest Crossing" from the reference image
    Then the reference image should not be linked to "Forest Crossing"

  Scenario: Annotate a reference image
    When I add a reference image to the board
    And I add the note "Keep the horizon soft" to the reference image
    Then the reference image should show the note "Keep the horizon soft"

  Scenario: Remove a reference image without deleting the file
    When I add a reference image to the board
    And I remove the reference image from the project
    Then the reference board should be empty and the file should still exist
