@depends-on:scenes-setup @scenes @scene-validation
Feature: Validating a scene
  A scene can be checked for the mistakes its own numbers cannot show. This
  exists because the opposite happened: a scene built through the MCP tools
  passed every check the server offered - consistent footprints, plausible
  overlaps - while containing furniture floating in mid-air and a test scene
  placed as a rug. So the checks report what they cannot see as well as what
  they found.

  Background:
    Given the following models exist in shared state:
      | name              |
      | scene-test-model  |
    And I am on the scenes page

  # Untagged on purpose: these are plain API calls against a two-node scene, so
  # the validation contract keeps its every-PR protection without costing the
  # fast lane a headless render.
  @scene-validation-blind-spots
  Scenario: Validation reports what it could not check, not just what it found
    Given a scene named "Validated Scene" is open
    And I have placed the test model into the scene
    And I save the scene
    When I validate the scene "Validated Scene"
    Then the validation should report a verdict
    And the validation should name its blind spots

  @scene-validation-floating
  Scenario: A node left in mid-air is reported, and reported on the write itself
    # Both halves of tier 2 in one pass: the write response has to carry the
    # finding at the moment the mistake is made, and validate_scene has to still
    # report it afterwards. A server that only answered the second question
    # would need the agent to suspect something was wrong before asking.
    Given a scene named "Floating Scene" is open
    And I have placed the test model into the scene
    And I save the scene
    When I lift the first node of the scene "Floating Scene" 5 m into the air
    Then the move response should report "Contact.Unsupported"
    When I validate the scene "Floating Scene"
    Then the validation should report "Contact.Unsupported"

  @scene-validation-missing
  Scenario: Validating a scene that is not there says so
    When I validate the scene with id 999999
    Then the validation lookup should report it does not exist
