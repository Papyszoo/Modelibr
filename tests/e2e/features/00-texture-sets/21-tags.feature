@texture-set @tags
Feature: Texture set tags (shared vocabulary)
  Texture sets draw from the same tag pool as models and environment maps.
  Tag a set, then narrow the grid by that tag using the list filter.

  Scenario: Tag a texture set and filter the grid by the tag
    Given I am on the texture sets page
    When I create a universal texture set "tag_target" for tagging
    And I create a universal texture set "tag_other" for tagging
    And I tag the texture set "tag_target" with "stylized"
    And I filter the texture set grid by tag "stylized"
    Then the tagged texture set "tag_target" should be visible in the grid
    And the tagged texture set "tag_other" should not be visible in the grid
