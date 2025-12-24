Feature: Stage Editor Functionality

  Scenario: Create and edit a new stage
    Given I am on the stage list page
    When I create a new stage "Test Stage"
    Then I should see "Test Stage" in the stage list
    When I open the stage "Test Stage"
    Then I should see the stage editor canvas

    When I add a "Point Light" from the component library
    Then I should see "Point Light" in the stage hierarchy

    When I select "Point Light" in the hierarchy
    And I change the "Intensity" property to "5"
    Then the "Intensity" property should be "5"
