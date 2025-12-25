@setup
Feature: Create Texture Sets via UI Upload

  Scenario: Create blue_color texture set via UI upload
    Given I am on the texture sets page
    When I upload texture "blue_color.png" via UI button
    Then texture set "blue_color" should be stored in shared state

  Scenario: Create red_color texture set via UI upload
    Given I am on the texture sets page
    When I upload texture "red_color.png" via UI button
    Then texture set "red_color" should be stored in shared state
