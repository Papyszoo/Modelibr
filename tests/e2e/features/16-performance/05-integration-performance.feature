@performance
Feature: Performance - Integration (ST-14, ST-15)

  Integration performance smoke tests validating network efficiency
  and database connection stability under sustained load.

  Excluded from CI — run only with: npm run test:performance

  # ST-14: Network efficiency — minimal transfer for thumbnail grid
  @timeout:300000
  Scenario: ST-14 Model grid page loads with efficient network transfer
    Given at least 10 models with thumbnails exist
    When I load the model grid page while measuring network transfer
    Then the total transfer size should be less than 5 MB

  # ST-15: Database connection stability — sustained request load
  @timeout:300000
  Scenario: ST-15 Database remains stable under sustained API load
    Given at least 10 models exist in the database via API
    When I send 50 rapid sequential requests to the models API
    Then no request should return a 500 error
    And no request should fail with a connection error
