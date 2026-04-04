@performance
Feature: Performance - Frontend (ST-1, ST-2, ST-3, ST-4)

  Frontend performance smoke tests validating interactivity, SignalR efficiency,
  virtualization, and tab switch cost.

  Excluded from CI — run only with: npm run test:performance

  # ST-1: Page interactivity during processing
  @timeout:600000
  Scenario: ST-1 Page remains interactive during thumbnail processing
    Given I am on the model list page
    When I bulk upload 5 models using unique files
    Then all 5 upload completions should be reported
    And I close the upload window
    And the page should remain interactive while thumbnails process
    And all 5 thumbnails should be generated within 3 minutes

  # ST-2: SignalR event storm — controlled API calls
  @timeout:600000
  Scenario: ST-2 SignalR events do not cause excessive API calls
    Given I am on the model list page
    When I bulk upload 5 models using unique files
    Then all 5 upload completions should be reported
    And I close the upload window
    And I monitor network requests while thumbnails generate for 5 models
    Then the total API calls to the models endpoint should be less than 50

  # ST-3: Infinite scroll memory — DOM virtualization
  @timeout:300000
  Scenario: ST-3 Virtualized grid keeps DOM node count low
    Given I am on the model list page
    And there are at least 10 models in the grid
    Then the visible DOM model card count should be less than the total model count

  # ST-4: Tab switch cost — minimal refetch
  @timeout:300000
  Scenario: ST-4 Tab switch does not trigger excessive refetches
    Given I am on the model list page
    And there are at least 5 models visible
    When I switch away from the tab and return
    Then at most 1 models endpoint request should be made during the tab switch
