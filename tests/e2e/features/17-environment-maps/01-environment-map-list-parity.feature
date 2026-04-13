@environment-maps
Feature: Environment map list parity
  Environment maps should match the current model-style list interactions.

  Scenario: Drag and drop upload updates the toolbar count and keeps the detected 4K label
    Given I am on the environment maps page
    Then the environment maps toolbar should include:
      | action  |
      | Search  |
      | Filters |
      | Upload  |
      | Refresh |
    And I remember the current environment maps toolbar count
    When I drag and drop a generated 4096x2048 environment map "lighting-sky-4k"
    Then the environment map "lighting-sky-4k" should be visible in the environment map list
    And the environment maps toolbar counter should increase by 1
    And the environment map upload progress should complete
    When I open the environment map "lighting-sky-4k"
    Then the environment map viewer for "lighting-sky-4k" should be visible
    And the environment map "lighting-sky-4k" should show the preview size option "4K"

  Scenario: Drag and drop HDR upload keeps the inferred 2K label
    Given I am on the environment maps page
    When I drag and drop a generated 2048x1024 HDR environment map "studio-hdr-2k"
    Then the environment map "studio-hdr-2k" should be visible in the environment map list
    And the environment map upload progress should complete
    When I open the environment map "studio-hdr-2k"
    Then the environment map viewer for "studio-hdr-2k" should be visible
    And the environment map "studio-hdr-2k" should show the preview size option "2K"
