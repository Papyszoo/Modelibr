@serial @depends-on:setup
Feature: Model Card Thumbnail Rendering

  # @serial: this assertion blocks on a real asset-processor render, which
  # GitHub's GPU-less PR runners time out on (repeated PR-lane failures in
  # July 2026). It runs on the local GPU lane via npm run test:all. The
  # render waits used to live inline in 00-texture-sets/01-setup.feature;
  # DB-level render checks for the multi-version model live in
  # 02-version-switching.feature (@slow).

  Background:
    Given the following models exist in shared state:
      | name                 |
      | single-version-model |

  Scenario: Uploaded model shows a rendered thumbnail in its card
    Then the model "single-version-model" should show a rendered thumbnail in its card
