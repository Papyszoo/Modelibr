@sessions
Feature: Sessions section restores closed windows

  The New Tab page surfaces a "Sessions" section that lists every archived
  (closed) browser window — distinct from the per-tab "Recently Closed"
  list. Each entry shows the tab count per panel, restores all tabs into
  the current window on click, and persists across reloads.

  Scenario: Sessions section appears for an archived window
    Given I am on the app with a clean slate
    And an archived session "demo" exists with 2 left tabs and 1 right tab
    When I open the New Tab page in the left panel
    Then the Sessions section should be visible
    And the session card should show 2 on the left and 1 on the right

  Scenario: Clicking a session restores all of its tabs into the current window
    Given I am on the app with a clean slate
    And an archived session "demo" exists with 2 left tabs and 1 right tab
    When I open the New Tab page in the left panel
    And I click the session card
    Then the dock should contain the "Models" tab on the left
    And the dock should contain the "Sounds" tab on the left
    And the dock should contain the "Sprites" tab on the right
    And the Sessions section should be gone

  Scenario: Closed sessions are remembered across reloads
    Given I am on the app with a clean slate
    And an archived session "demo" exists with 2 left tabs and 1 right tab
    When I reload the app
    And I open the New Tab page in the left panel
    Then the Sessions section should be visible
    And the session card should show 2 on the left and 1 on the right

  Scenario: A second browser page sees the first page's archived session
    Given I am on the app with a clean slate
    And a second browser page is opened
    When the second page archives an extra session "peer" with 1 left tab
    And I reload the app
    And I open the New Tab page in the left panel
    Then the Sessions section should be visible
    And exactly 1 session card should be present
