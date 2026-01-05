@texture-types
# Feature is PARTIALLY implemented. Tests need updates to match actual UI selectors.
# The Texture Types tab and Files tab exist, but tests use wrong CSS selectors.
Feature: Simplified Texture Types
  Verify reduced texture type list (no Diffuse/Specular)
  and mutual exclusivity of Height/Displacement/Bump

  Background:
    Given I am on the texture sets page

  @type-list
  Scenario: Available texture types should not include Diffuse or Specular
    When I open the texture set viewer for any set
    Then the texture type cards should be visible
    And I should see texture cards for:
      | Albedo    |
      | Normal    |
      | AO        |
      | Roughness |
      | Metallic  |
      | Emissive  |
      | Alpha     |
    And I should see the Height/Displacement/Bump card
    And I should NOT see texture cards for:
      | Diffuse  |
      | Specular |
