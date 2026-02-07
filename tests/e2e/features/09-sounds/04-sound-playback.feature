@depends-on:sounds-setup @sounds @playback
Feature: Sound Playback and Waveform
  Tests that uploaded sounds can be played and waveform visualization renders.

  Background:
    Given I am on the sounds page

  @sound-waveform-render
  Scenario: Sound editor displays waveform after opening
    Given the sound "crud-test-sound" exists in shared state
    When I open the sound "crud-test-sound" for viewing
    Then the waveform visualization should be rendered

  @sound-playback-controls
  Scenario: Sound play button triggers audio playback
    Given the sound "crud-test-sound" exists in shared state
    When I open the sound "crud-test-sound" for viewing
    And I click the play button
    Then the play button should change to a pause icon
