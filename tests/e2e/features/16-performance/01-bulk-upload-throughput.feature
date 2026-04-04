@performance
Feature: Performance - Full Pipeline & Thumbnail Integrity (ST-5, ST-13)

  Validates full upload-to-thumbnail pipeline and concurrent thumbnail updates.
  Ensures renderer pool fix works (each concurrent job gets own WebGL context).

  Excluded from CI — run only with: npm run test:performance

  # ST-13: Full pipeline — upload models, wait for all thumbnails
  @timeout:600000
  Scenario: ST-13 Full pipeline - upload 10 models and verify all thumbnails appear
    Given I am on the model list page
    When I bulk upload 10 models using unique files
    Then all 10 upload completions should be reported
    And I close the upload window
    And all 10 models should be visible in the grid
    And all 10 thumbnails should be generated within 5 minutes
    And every thumbnail image should be unique

  # ST-5: Concurrent thumbnail updates — grid updates smoothly
  @timeout:600000
  Scenario: ST-5 Concurrent thumbnail updates - no duplicate API calls
    Given I am on the model list page
    When I bulk upload 5 models using unique files
    Then all 5 upload completions should be reported
    And I close the upload window
    And all 5 thumbnails should be generated within 3 minutes
    And no thumbnail should show multiple overlapping models
