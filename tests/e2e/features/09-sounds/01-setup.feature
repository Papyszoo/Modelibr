@setup @sounds-setup
Feature: Setup - Create Test Data for Sound CRUD Tests
  This setup feature creates test assets needed for sound CRUD testing.

  Scenario: Create test sounds for CRUD tests
    Given I am on the sounds page
    When I upload a sound named "crud-test-sound" from "test-tone.wav"
    Then the sound "crud-test-sound" should be visible in the sound list
    And I store the sound "crud-test-sound" in shared state
