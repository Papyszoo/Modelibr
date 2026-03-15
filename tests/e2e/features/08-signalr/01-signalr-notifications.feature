@depends-on:setup @slow
Feature: SignalR Real-Time Notifications
  Tests that SignalR WebSocket connections deliver real-time updates
  for thumbnail generation and model CRUD operations.

  @signalr-thumbnail-notification @timeout:720000
  Scenario: Thumbnail generation sends SignalR notification
    Given I am on the model list page
    When I upload a model and listen for SignalR thumbnail notification
    Then I should receive a thumbnail status changed notification via WebSocket
    And the thumbnail notification should contain valid model version data

  @signalr-connection @timeout:30000
  Scenario: SignalR WebSocket connection is established on model list page
    Given I navigate to the application
    When the model list page loads
    Then a WebSocket connection to thumbnailHub should be established

  @signalr-payload-validation @timeout:720000
  Scenario: ThumbnailStatusChanged notification has valid payload
    Given I am on the model list page
    When I upload a model and listen for SignalR thumbnail notification
    Then the notification should contain "modelVersionId" as a positive integer
    And the notification should contain "status" as a valid thumbnail status

  @signalr-active-version-changed @timeout:720000
  Scenario: Active version change sends SignalR notification
    Given I am on the model list page
    And a model exists with a completed thumbnail
    When I upload a new version and listen for ActiveVersionChanged
    Then I should receive an ActiveVersionChanged notification via WebSocket
    And the ActiveVersionChanged notification should contain the model ID
