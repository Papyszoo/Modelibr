@environment-maps @slow
Feature: Environment map thumbnail generation
  Generated thumbnails should appear for uploaded panoramas and can be replaced with a custom thumbnail.

  Scenario: A generated environment map thumbnail appears, can be overridden, and can be regenerated
    Given I am on the environment maps page
    When I drag and drop a generated 4096x2048 environment map "generated-thumb"
    Then the environment map "generated-thumb" should be visible in the environment map list
    And the environment map "generated-thumb" should eventually have a generated thumbnail
    And the environment map card for "generated-thumb" should use the generated preview thumbnail
    When I open the environment map "generated-thumb"
    Then the environment map viewer for "generated-thumb" should be visible
    When I upload a custom thumbnail for the environment map "generated-thumb" from "blue_color.png"
    Then the environment map card for "generated-thumb" should use the custom thumbnail
    And the environment map viewer should show the custom thumbnail for "generated-thumb"
    When I regenerate the thumbnail for the environment map "generated-thumb"
    Then the environment map card for "generated-thumb" should use the generated preview thumbnail
    And the environment map viewer should show the generated thumbnail for "generated-thumb"

  @signalr
  Scenario: An uploaded HDRI environment map thumbnail appears live without refresh
    Given I start listening for environment map thumbnail SignalR notifications
    And I am on the environment maps page
    When I upload the real HDRI environment map "live-hdri-thumb" and watch for live thumbnail updates
    Then the environment map "live-hdri-thumb" should be visible in the environment map list
    And the environment map card for "live-hdri-thumb" should initially not use the generated preview thumbnail
    And I should receive an environment map thumbnail ready notification via WebSocket for "live-hdri-thumb"
    And the environment map card for "live-hdri-thumb" should switch to the generated thumbnail without refreshing
