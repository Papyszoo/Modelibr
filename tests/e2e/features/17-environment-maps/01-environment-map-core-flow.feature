@environment-maps
Feature: Environment map core flow
  Covers the primary user workflow for environment maps.

  Scenario: Upload, extend, and recycle an environment map
    Given I am on the environment maps page
    When I upload an environment map "lighting-sky" from "red_color.png"
    Then the environment map "lighting-sky" should be visible in the environment map list
    When I open the environment map "lighting-sky"
    Then the environment map viewer for "lighting-sky" should be visible
    And the environment map "lighting-sky" should show the preview size option "1K"
    When I upload a "2K" variant for the environment map "lighting-sky" from "blue_color.png"
    Then the environment map "lighting-sky" should show the preview size options "1K" and "2K"
    And the environment map "lighting-sky" should show 2 variants in the viewer
    When I recycle the environment map "lighting-sky"
    Then the environment map "lighting-sky" should not be visible in the environment map list
    When I navigate to the Recycled Files page
    Then the environment map "lighting-sky" should be visible in recycled files
