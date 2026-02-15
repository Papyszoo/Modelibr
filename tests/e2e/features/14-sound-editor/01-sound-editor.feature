@depends-on:sounds-setup @sounds @editor
Feature: Sound Editor Features
  Tests the sound editor's waveform visualization and playback controls.

  Background:
    Given I am on the sounds page
    And the sound "crud-test-sound" exists in shared state

  @sound-editor-open
  Scenario: Opening a sound displays the editor with waveform
    When I open the sound "crud-test-sound" for viewing
    Then the waveform should be rendered
    And the playback controls should be visible

  @sound-editor-play-pause
  Scenario: Play and pause controls work correctly
    When I open the sound "crud-test-sound" for viewing
    And I click the play button
    Then the pause button should be visible
    When I click the pause button
    Then the play button should be visible

  @sound-editor-duration
  Scenario: Sound editor shows duration information
    When I open the sound "crud-test-sound" for viewing
    Then the duration display should show a valid time
