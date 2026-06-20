# @serial: the seeding step waits for the worker's technical-metadata write
# (to win the overwrite race) before asserting. Under the parallel chromium
# phase the asset-processor can't service these fresh jobs in time (60s+ poll
# timeouts observed), so this runs in the sequential phase like its sibling
# 01-model-metadata.feature.
@serial
Feature: Model Metadata Filters
  The animated-only and triangle-range filters narrow the model list by the
  geometry/animation metadata extracted during processing. The seeding step
  waits for the worker's own metadata write before overriding, so the filter
  assertions are deterministic (no render-timing race).

  Background:
    Given I am on the model list page

  Scenario: Animated filter shows only models with animations
    Given I upload a model "test-cube.glb" and store it as "rigged-hero"
    And I upload a model "test-cube.glb" and store it as "static-prop"
    And the model "rigged-hero" has 50000 triangles and 3 animations
    And the model "static-prop" has 800 triangles and 0 animations
    And I am on the model list page
    When I enable the animated-only filter
    Then the model list should show model "rigged-hero"
    And the model list should not show model "static-prop"

  Scenario: Triangle-range filter narrows by triangle count
    Given I upload a model "test-cube.glb" and store it as "high-poly-asset"
    And I upload a model "test-cube.glb" and store it as "low-poly-asset"
    And the model "high-poly-asset" has 90000 triangles and 0 animations
    And the model "low-poly-asset" has 500 triangles and 0 animations
    And I am on the model list page
    When I filter the model list by minimum 10000 triangles
    Then the model list should show model "high-poly-asset"
    And the model list should not show model "low-poly-asset"
