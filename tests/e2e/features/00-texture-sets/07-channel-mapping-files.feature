@texture-types @channel-mapping
# Feature is implemented. Tests updated to match actual FilesTab component.
Feature: Channel Mapping - Files Tab
  Verify Files tab displays uploaded files with channel mapping info

  Background:
    Given I am on the texture sets page

  @files-tab
  Scenario: Files tab shows uploaded files with channel information
    Given I have a texture set with uploaded textures
    When I open the texture set viewer
    And I switch to the Files tab
    Then the files tab should display the uploaded files
    And each file should show its texture type usage

  @channel-display
  Scenario: Files tab shows channel dropdown for split channel textures
    Given I have a texture set with ORM packed texture
    When I open the texture set viewer
    And I switch to the Files tab
    Then the file should show split channels mode
    And I should see R, G, B channel dropdowns
    And I take a screenshot named "files-tab-channel-dropdown"
