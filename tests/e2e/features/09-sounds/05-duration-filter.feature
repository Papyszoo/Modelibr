# @serial: waits for the worker's ffprobe duration analysis. Under the parallel
# chromium phase the waveform job is queued behind other asset-processor work and
# doesn't finish within the poll window (60s timeout observed), so this runs in
# the sequential phase like its sibling 02-sound-crud.feature.
@serial
Feature: Sound Duration Filter
  The sounds list can be narrowed by a duration range. The worker extracts the
  authoritative duration with ffprobe, so the scenario waits for that analysis
  (bounded poll) and then filters relative to the real value.

  Scenario: Duration filter hides sounds shorter than the minimum
    Given the sound "tone-clip" exists in shared state
    And the sound "tone-clip" has an analyzed duration
    And I am on the sounds page
    When I filter sounds by a minimum duration longer than "tone-clip"
    Then the sounds list should not show "tone-clip"
    When I clear the sound duration filter
    Then the sounds list should show "tone-clip"
