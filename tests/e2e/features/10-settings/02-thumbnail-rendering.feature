@settings @slow @thumbnail-rendering
Feature: Thumbnail rendering honors live settings
  The asset-processor must refresh its render config from the backend before
  every job. These scenarios change the thumbnail size, trigger a bulk
  regeneration, wait for the worker to actually re-render, and then read the
  PNG IHDR off the served file to prove the on-disk dimensions match the
  saved setting. This is the integration-level guarantee that the cheaper
  unit tests can't make on their own.

  Background:
    Given settings are reset to defaults via API
    And at least one model with a thumbnail exists

  @thumbnail-rendering-respects-size
  Scenario: A new thumbnail size produces files at that size
    When I set the thumbnail size to "128" via API
    And I regenerate all thumbnails via API
    And I wait for the regeneration to complete
    Then the served thumbnail PNG should be 128 by 128 pixels

  @thumbnail-rendering-respects-frame-count
  Scenario: Frame count is read live from settings per job
    When I set the thumbnail frame count to "5" and animated to "true" via API
    And I regenerate all thumbnails via API
    And I wait for the regeneration to complete
    Then the latest worker job should have rendered exactly 5 frames
