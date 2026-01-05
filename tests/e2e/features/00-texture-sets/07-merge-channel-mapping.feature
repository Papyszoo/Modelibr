@texture-sets @merge
Feature: Merge Texture Sets with Channel Mapping
  As a user managing texture sets
  I want to map channels from source textures when merging
  So that I can use channel-packed textures like ORM maps

  Background:
    Given I am on the texture sets page

  # Note: Additional scenarios for Albedo merge and override warnings are 
  # temporarily disabled due to backend constraint IX_Textures_FileId_TextureType_SourceChannel
  # preventing the same file content from being used in multiple texture sets.
  # This requires a backend fix to allow TextureSet-scoped uniqueness.

  Scenario: Merge ORM packed texture using Split Channels
    Given texture set "Source ORM" exists with file "texture_orm.png"
    And texture set "ORM Target" exists
    When I drag "Source ORM" onto "ORM Target"
    Then I should see a merge dialog showing source files
    When I select "Split Channels" for the RGB dropdown
    And I set the R channel to "AO"
    And I set the G channel to "Roughness"
    And I set the B channel to "Metallic"
    And I click "Merge Textures"
    Then "ORM Target" should have AO, Roughness, and Metallic textures
