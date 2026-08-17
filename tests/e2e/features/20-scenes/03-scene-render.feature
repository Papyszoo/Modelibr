@depends-on:scenes-setup @scenes @scene-render
Feature: Rendering a scene back
  A scene can be photographed by the worker and collected afterwards. This is how
  an agent sees its own work: the render goes through the same component the
  editor draws with, so a picture that disagrees with the editor is a bug rather
  than a second opinion.

  Background:
    Given the following models exist in shared state:
      | name              |
      | scene-test-model  |
    And I am on the scenes page

  # @slow for duration, not to dodge a flake: this one waits on a headless
  # browser loading the app and every asset in the scene, so it costs the better
  # part of a minute even when nothing is wrong. The two checks below it are
  # plain API calls and stay untagged, so the request contract keeps its
  # every-PR protection.
  @scene-render-roundtrip @slow
  Scenario: A saved scene can be rendered and collected as an image
    # End to end on purpose. The render drives a real browser against the real
    # frontend, so the parts that can silently disagree - the render URL, the
    # readiness signal, FRONTEND_URL resolving from inside the worker container -
    # are only exercised together. A unit test of any one of them passes while
    # the whole path returns a timeout.
    Given a scene named "Rendered Scene" is open
    And I have placed the test model into the scene
    And I save the scene
    When I request a render of the scene "Rendered Scene"
    Then the render should complete
    And the render should be a PNG image
    And the render should report every placed node as loaded

  @scene-render-unknown-viewpoint
  Scenario: An unrecognised viewpoint is refused rather than rendered
    # The app serves its normal self for a query string it does not understand
    # and never publishes a status, so a bad viewpoint that reached the renderer
    # would surface a minute later as a timeout - and send someone hunting a slow
    # scene instead of a typo.
    Given a scene named "Bad Viewpoint Scene" is open
    And I save the scene
    When I request a render of the scene "Bad Viewpoint Scene" from "sideways"
    Then the render request should be rejected

  @scene-render-missing
  Scenario: Collecting a render that was never requested says so
    # "Not ready yet" and "no such render" have to be different answers: one
    # means keep polling, the other means the id is wrong.
    When I collect the render with id 999999
    Then the render lookup should report it does not exist
