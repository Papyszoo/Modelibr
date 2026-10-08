@vfx
Feature: Visual effects
  A visual effect layers timed components - particles, meshes, lights and
  sounds - on one timeline. These cover the flow the feature exists for:
  create an effect from the VFX tab, build it out of components, scrub the
  timeline, and have the work survive a save - plus the API contract an agent
  or editor depends on.

  @vfx-create
  Scenario: Create effect from VFX tab
    Given the user is on the new-tab page
    When the user clicks the VFX tile
    Then the VFX list is displayed with a create button
    When the user clicks the create button
    Then the VFX editor is displayed

  @vfx-components
  Scenario: Add components and verify persistence
    Given the user has created a VFX effect
    When the user adds a particles component
    Then the timeline shows one track for particles
    When the user adds a light component
    Then the timeline shows two tracks (particles and light)
    And the effect autosaves with "Saved" message
    When the user navigates back to the VFX list and reopens the effect
    Then the particles and light components are still present in the timeline

  @vfx-scrub
  Scenario: Click timeline ruler to move playhead
    Given the user has a VFX effect open in the editor
    When the user clicks the timeline ruler at a non-zero position
    Then the time readout changes from 0.00 to the clicked position

  @vfx-api
  Scenario: API validation and export
    Given the API endpoint for VFX is available
    When the user sends an invalid VFX definition via POST /vfx
    Then the response indicates validation errors with field paths
    When the user sends a valid VFX definition via POST /vfx
    Then the response is 201 Created
    When the user requests the Godot export for the effect
    Then the response is 200 with content-type application/zip
    And the zip file contains Godot-compatible content

  @vfx-delete
  Scenario: Delete effect from list
    Given the user has created a VFX effect
    When the user navigates to the VFX list
    And the user clicks the delete button for that effect
    Then the effect is removed from the list
    And a confirmation or success message appears
