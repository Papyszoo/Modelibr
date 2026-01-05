@texture-types @channel-mapping
# Feature is implemented. Tests updated to match actual TextureCard and HeightCard components.
Feature: Channel Mapping - Texture Types Tab
  Verify Texture Types tab displays type cards correctly

  Background:
    Given I am on the texture sets page

  @types-tab-layout
  Scenario: Texture Types tab shows cards for each texture type
    Given I have a texture set with uploaded textures
    When I open the texture set viewer
    Then I should see texture cards for each type
    And I should see the Height/Displacement/Bump card with mode dropdown

  @height-mode
  Scenario: Height card shows mode dropdown
    Given I have a texture set with a height texture
    When I open the texture set viewer
    Then the Height card should show a mode dropdown
    And the mode dropdown should have Height, Displacement, Bump options
