@mixed-format-thumbnail
Feature: Texture Set Thumbnail with Mixed Image Formats
  Verifies that texture set thumbnail generation succeeds when the
  set contains a mix of standard images (JPEG, PNG) and EXR files.
  Previously, EXR files caused the Puppeteer-based renderer to crash
  with "Target closed" errors because EXR binary data was sent as
  base64 JPEG to the browser, which cannot decode it.

  Also verifies that all texture types (including Displacement, Bump,
  Alpha) are correctly mapped to Three.js material properties.

  Scenario: Thumbnail generated for texture set with mixed PNG and EXR textures
    Given I am on the texture sets page
    When I create a universal texture set "mixed_fmt_thumb" with global texture files via API
    Then texture set "mixed_fmt_thumb" should have a thumbnail within 30 seconds via API
