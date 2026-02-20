@thumbnail-previews
Feature: Auto-generated Thumbnail Previews
  Thumbnails should be auto-generated on file upload.
  Texture files should have 4 thumbnails (RGB, R, G, B).
  Sprite files should have 1 thumbnail (RGB).
  All preview surfaces should use thumbnails instead of raw files.

  @thumbnail-api
  Scenario: Texture file upload generates RGB preview
    Given I upload a texture PNG file via API
    Then the file should have an RGB preview available via API
    And the preview should be a PNG image

  @thumbnail-api
  Scenario: Texture file upload generates per-channel previews
    Given I upload a texture PNG file via API
    Then the file should have a "r" channel preview available via API
    And the file should have a "g" channel preview available via API
    And the file should have a "b" channel preview available via API

  @thumbnail-api
  Scenario: Sprite file upload generates RGB preview
    Given I upload a sprite PNG file via API
    Then the sprite file should have an RGB preview available via API

  @thumbnail-api
  Scenario: EXR texture file upload generates RGB preview
    Given I upload a texture EXR file via API
    Then the file should have an RGB preview available via API
    And the preview should be a PNG image

  @thumbnail-api
  Scenario: EXR texture file upload generates per-channel previews
    Given I upload a texture EXR file via API
    Then the file should have a "r" channel preview available via API
    And the file should have a "g" channel preview available via API
    And the file should have a "b" channel preview available via API

  @thumbnail-ui
  Scenario: Texture set grid shows thumbnail previews
    Given I have a texture set with an uploaded texture
    When I navigate to the texture sets page for thumbnail test
    Then the texture set card should display a preview image from the preview endpoint

  @thumbnail-ui
  Scenario: Texture Types tab shows thumbnail previews
    Given I have a texture set with an uploaded texture
    When I open the texture set detail viewer
    Then the texture type card should display a preview image from the preview endpoint

  @thumbnail-ui
  Scenario: Files tab shows thumbnail previews
    Given I have a texture set with an uploaded texture
    When I open the texture set detail viewer
    And I switch to the Files tab
    Then the file preview should display an image from the preview endpoint

  @thumbnail-ui
  Scenario: Sprites page shows thumbnail previews
    Given I have a sprite with an uploaded image
    When I navigate to the sprites page for thumbnail test
    Then the sprite card should display a preview image from the preview endpoint
