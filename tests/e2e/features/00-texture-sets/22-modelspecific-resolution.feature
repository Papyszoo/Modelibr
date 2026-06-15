# Untagged (runs on every PR): unlike the Universal resolution filter
# (21-resolution-filter.feature, @serial), Multi-Model sets never get a worker
# thumbnail pass — the backend extracts their texture dimensions synchronously at
# upload time. So there is no asset-processor poll and no contention, and the
# assertions are deterministic the moment the upload request returns.
Feature: Multi-Model Texture Set Resolution
  Multi-Model (ModelSpecific) texture sets capture each texture's source-image
  resolution on the backend at upload time. This scenario uploads textures of
  known, distinct sizes (1024px vs 256px) and asserts both the extracted
  dimensions (DB) and the min-resolution filter (UI) with no override, exercising
  the real extraction path.

  Scenario: Multi-Model sets capture upload-time resolution for the min-resolution filter
    Given I am on the texture sets page
    And I create a Multi-Model texture set "msres-hires"
    And I upload texture "orm_test_channels.png" to texture set "msres-hires"
    And I create a Multi-Model texture set "msres-lores"
    And I upload texture "red_color.png" to texture set "msres-lores"
    Then the texture set "msres-hires" should have extracted resolution 1024
    And the texture set "msres-lores" should have extracted resolution 256
    When I view the Multi-Model texture sets
    And I search texture sets for "msres"
    And I filter texture sets by minimum resolution "1K+"
    Then the texture set "msres-hires" should be listed
    And the texture set "msres-lores" should not be listed
