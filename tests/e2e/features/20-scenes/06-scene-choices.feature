@depends-on:scenes-setup @scenes
Feature: Scene choices
  An agent that silently picks assets produces a scene whose choices cannot be
  argued with. So the meaningful decisions in a scene are open slots with named
  candidates, and the user resolves them.

  These cover the loop the feature exists for: options appear with the numbers
  that justify them, a card is chosen by a name a person can say out loud, and a
  rejection is kept with its reason rather than deleted.

  Background:
    Given the following models exist in shared state:
      | name             |
      | scene-test-model |
    And I am on the scenes page

  @scene-choices-shown
  Scenario: An open decision appears as named candidates beside the viewport
    Given a scene named "Choices Scene" is open
    And the test model is placed in the scene for the slot "streetlight"
    And two candidates have been proposed for the slot "streetlight"
    When I reopen the scene "Choices Scene"
    Then the choices panel should offer "streetlight/A"
    And the choices panel should offer "streetlight/B"
    And the choices panel should offer "streetlight/C"

  @scene-choices-choose
  Scenario: Choosing a candidate applies it and records that a person decided
    Given a scene named "Chosen Scene" is open
    And the test model is placed in the scene for the slot "streetlight"
    And two candidates have been proposed for the slot "streetlight"
    When I reopen the scene "Chosen Scene"
    And I choose the candidate "streetlight/B"
    Then the slot "streetlight" should be chosen as "B" by "user"

  @scene-choices-reject
  Scenario: None of these keeps every card with the reason it was ruled out
    # Rejections are feedback, not deletions. The card stays so the user sees
    # what was already ruled out - and so does the agent reading the slot back
    # before it proposes again.
    Given a scene named "Rejected Scene" is open
    And the test model is placed in the scene for the slot "streetlight"
    And two candidates have been proposed for the slot "streetlight"
    When I reopen the scene "Rejected Scene"
    And I reject the whole round for the slot "streetlight" saying "all too modern"
    Then the choices panel should still offer "streetlight/B"
    And the slot "streetlight" should record "all too modern" against every candidate

  @scene-choices-store
  Scenario: A store candidate is shown as not owned and cannot be chosen
    # The agent may propose something the library does not have. Settling the
    # slot on it means acquiring it first, so the card says so instead of
    # offering a Choose button that the server refuses.
    Given a scene named "Store Choice Scene" is open
    And the test model is placed in the scene for the slot "streetlight"
    And a store candidate has been proposed for the slot "streetlight"
    When I reopen the scene "Store Choice Scene"
    Then the choices panel should offer "streetlight/B"
    And the candidate "streetlight/B" should be marked as not in the library
    And the candidate "streetlight/B" cannot be chosen
