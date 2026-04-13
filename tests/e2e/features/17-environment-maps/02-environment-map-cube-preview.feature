@environment-maps
Feature: Cube environment maps and preview loading
  Users can upload cube textures with explicit face mapping and inspect them in the viewer.

  Scenario: Upload a cube environment map with a custom thumbnail and preview it
    Given I am on the environment maps page
    When I upload the cube environment map "studio-cube" with size label "1K" and custom thumbnail "texture_albedo.png" using:
      | face | filename        |
      | px   | red_color.png   |
      | nx   | blue_color.png  |
      | py   | green_color.png |
      | ny   | yellow_color.png |
      | pz   | pink_color.png  |
      | nz   | black_color.png |
    Then the environment map "studio-cube" should be visible in the environment map list
    And the environment map card for "studio-cube" should use the custom thumbnail
    When I open the environment map "studio-cube"
    Then the environment map viewer for "studio-cube" should be visible
    And the environment map "studio-cube" should show the preview size option "1K"
    And the environment map "studio-cube" should show "Cube" as the detail value for "Source"
    And the environment map "studio-cube" should show "Cube" as the detail value for "Projection"
    And the environment map "studio-cube" should load a Three.js preview scene
    And the environment map "studio-cube" should expose all cube faces through the API and database
