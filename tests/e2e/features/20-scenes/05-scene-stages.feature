@depends-on:scenes-setup @scenes @scene-stages
Feature: Authoring a scene in stages
  A scene is built composition first and colour last: room shell and large
  forms, then detail, then light, then materials. Working the other way round
  is what a real run did, and it paid for four lighting attempts and three
  floor swaps over a room in which every object was floating half its height.

  So the stages are enforced rather than advised. Moving forward is refused
  while something in the scene is standing on nothing, and until a scene says
  it has been lit and dressed, the findings about light and material are notes
  rather than warnings.

  Background:
    Given the following models exist in shared state:
      | name              |
      | scene-test-model  |
    And I am on the scenes page

  # Untagged on purpose, like the validation scenarios beside them: plain API
  # calls against a one-node scene, so the stage contract keeps its every-PR
  # protection without costing the fast lane a headless render.
  @scene-stages-declared
  Scenario: A scene declares how far it has been taken
    Given a scene named "Staged Scene" is open
    And I have placed the test model into the scene
    And I save the scene
    When I move the scene "Staged Scene" to the "layout" stage
    Then the scene "Staged Scene" should report the "layout" stage
    And the validation of "Staged Scene" should judge it against the "layout" stage

  @scene-stages-defer-appearance
  Scenario: Missing light is a note while a scene is still being blocked out
    # Demoted, never dropped. A check that goes silent is indistinguishable
    # from a check that passed - which is the failure the whole validation
    # feature exists to prevent - so the finding stays in the list and stops
    # counting towards the verdict.
    Given a scene named "Blockout Scene" is open
    And I have placed the test model into the scene
    And I save the scene
    And I move the scene "Blockout Scene" to the "layout" stage
    When I validate the scene "Blockout Scene"
    Then the validation should report "Appearance.Unlit" as "info"

  @scene-stages-gate
  Scenario: A scene cannot claim it is dressed while something floats
    # The mechanism that would have stopped the original failure. The node is
    # lifted with groundSnap explicitly off, which is the one contact problem a
    # write cannot repair on its own - and the one that shipped a living room
    # full of floating furniture.
    Given a scene named "Floating Stage Scene" is open
    And I have placed the test model into the scene
    And I save the scene
    And I lift the first node of the scene "Floating Stage Scene" 5 m into the air
    When I move the scene "Floating Stage Scene" to the "dressed" stage
    Then the stage change should be refused for "Contact.Unsupported"
    And the scene "Floating Stage Scene" should report no stage

  @scene-stages-suspended
  Scenario: Declaring a node as hanging answers the gate
    # The escape, and the reason the gate is a question rather than a wall: a
    # pendant lamp is meant to hang, and saying so is a durable fact about the
    # node rather than a way past one call.
    Given a scene named "Hanging Stage Scene" is open
    And I have placed the test model into the scene
    And I save the scene
    And I lift the first node of the scene "Hanging Stage Scene" 5 m into the air
    And I declare the first node of the scene "Hanging Stage Scene" as hanging
    When I move the scene "Hanging Stage Scene" to the "dressed" stage
    Then the scene "Hanging Stage Scene" should report the "dressed" stage

  @scene-stages-retreat
  Scenario: A scene can always go back to fix its composition
    Given a scene named "Reopened Scene" is open
    And I have placed the test model into the scene
    And I save the scene
    And I move the scene "Reopened Scene" to the "dressed" stage
    When I lift the first node of the scene "Reopened Scene" 5 m into the air
    And I move the scene "Reopened Scene" to the "layout" stage
    Then the scene "Reopened Scene" should report the "layout" stage
