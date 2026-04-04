@performance
Feature: Performance - Asset Processor (ST-10, ST-11, ST-12)

  Asset processor performance smoke tests validating parallel processing,
  queue capacity, and memory usage under load.

  Excluded from CI — run only with: npm run test:performance

  # ST-10: Parallel processing — multiple jobs simultaneously
  @timeout:1500000
  Scenario: ST-10 Asset processor processes jobs in parallel
    When I upload 6 models concurrently via the API
    Then all 6 uploads should succeed with no server errors
    And all 6 models should have thumbnails within 20 minutes
    And the total processing time should indicate parallel execution

  # ST-11: Queue capacity — all jobs processed
  @timeout:1500000
  Scenario: ST-11 Job queue processes all queued jobs without loss
    When I upload 15 models sequentially via the API
    Then all 15 uploads should succeed with no server errors
    And all 15 models should have thumbnails within 20 minutes

  # ST-12: Memory under load — worker stays within limits
  @timeout:1500000
  Scenario: ST-12 Asset processor memory stays within limits during processing
    When I upload 10 models concurrently via the API
    Then all 10 uploads should succeed with no server errors
    And all 10 models should have thumbnails within 20 minutes
    And the asset processor container memory should be under 4 GB
