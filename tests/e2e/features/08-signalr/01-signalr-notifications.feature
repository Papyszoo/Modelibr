@depends-on:setup
Feature: SignalR Real-Time Notifications
  Tests that SignalR WebSocket connections deliver real-time updates
  for thumbnail generation and model CRUD operations.

  @signalr-thumbnail-notification
  Scenario: Thumbnail generation sends SignalR notification
    Given I am on the model list page
    When I upload a model and listen for SignalR thumbnail notification
    Then I should receive a thumbnail status changed notification via WebSocket
    And the thumbnail notification should contain valid model version data
