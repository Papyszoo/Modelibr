@performance
Feature: Performance - Backend API (ST-6, ST-7, ST-8, ST-9)

  Backend performance smoke tests validating paginated query speed, concurrent
  thumbnail status, SignalR broadcast throughput, and upload storm resilience.

  Excluded from CI — run only with: npm run test:performance

  # ST-6: Paginated query at scale
  @timeout:600000
  Scenario: ST-6 Paginated model query responds quickly at scale
    Given 25 models exist in the database via API
    When I request page 1 with pageSize 25 from the models API
    Then the response should arrive within 500 milliseconds
    And the response should contain pagination metadata

  # ST-7: Concurrent thumbnail status
  @timeout:300000
  Scenario: ST-7 Concurrent thumbnail status requests all resolve quickly
    Given at least 10 models exist in the database via API
    When I send 10 concurrent GET requests for model details
    Then all 10 responses should have status 200
    And every response should arrive within 1000 milliseconds

  # ST-8: SignalR broadcast throughput — no dropped events
  @timeout:600000
  Scenario: ST-8 SignalR delivers all thumbnail events without drops
    Given I am on the model list page
    When I bulk upload 5 models using unique files
    Then all 5 upload completions should be reported
    And I close the upload window
    And all 5 thumbnails should be generated within 3 minutes

  # ST-9: Upload storm — server stability
  @timeout:600000
  Scenario: ST-9 Server remains stable under concurrent uploads via API
    When I upload 10 models concurrently via the API
    Then all 10 uploads should succeed with no server errors
