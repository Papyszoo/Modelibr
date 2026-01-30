@depends-on:sounds-setup @sounds @crud
Feature: Sound CRUD Operations
  Create, Read, Update, Delete operations for sounds.

  Scenario: Upload a sound with a custom name
    Given I am on the sounds page
    When I upload a sound named "unique-sound-test" from "test-tone.wav"
    Then the sound "unique-sound-test" should be visible in the sound list
    And I store the sound "unique-sound-test" in shared state

  @update
  Scenario: Update sound name
    Given I am on the sounds page
    And the sound "crud-test-sound" exists in shared state
    When I open the sound "crud-test-sound" for viewing
    And I change the sound name to "renamed-sound"
    And I save the sound changes
    Then the sound "renamed-sound" should be visible in the sound list
    And the sound "crud-test-sound" should not be visible

  @delete
  Scenario: Delete a sound via API
    Given I am on the sounds page
    And the sound "unique-sound-test" exists in shared state
    When I delete the sound "unique-sound-test" via API
    Then the sound "unique-sound-test" should not be visible
