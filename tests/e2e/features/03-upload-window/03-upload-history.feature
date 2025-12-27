@depends-on:setup
Feature: Upload History Page
  Tests the Upload History page displays and navigates correctly.
  These tests run after @setup tests which upload models, so history should exist.

  Background:
    Given I am on the model list page

  @history-display
  Scenario: Upload History page shows previous uploads
    When I navigate to the Upload History page
    Then I should see the "Upload History" header
    And I should see at least one upload batch
    And each batch should display a timestamp
    And I take a screenshot of the upload history page

  @history-item-details
  Scenario: History items show correct details
    When I navigate to the Upload History page
    Then I should see at least one history item
    And the item should display the filename
    And the item should display an extension icon
    And the item should display an "Uploaded to" location

  @history-open-model
  Scenario: History navigation opens model in viewer
    When I navigate to the Upload History page
    And I find a history item with a model
    When I click the "Open Model" button for that item
    Then a model viewer tab should be opened
    And the model viewer should be visible

  @history-refresh
  Scenario: Refresh button reloads history
    When I navigate to the Upload History page
    When I click the refresh button
    Then the history should be reloaded
