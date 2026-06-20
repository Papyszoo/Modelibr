# @serial: waits for the worker to extract per-texture dimensions. Under the
# parallel chromium phase the texture-set job for this freshly-created set isn't
# serviced within the poll window (60s timeout observed), so this runs in the
# sequential phase alongside the other asset-processor-dependent suites.
@serial
Feature: Texture Set Resolution Filter
  Texture sets can be narrowed by the largest texture resolution in the set. The
  worker extracts per-texture dimensions during processing; this scenario waits
  for that write (bounded poll) then pins each set to a deterministic resolution
  so the filter assertions are stable.

  Scenario: Min-resolution filter keeps only sets at or above the threshold
    Given I am on the texture sets page
    And I create a Global Material texture set "restest-hires"
    And I upload texture "red_color.png" to texture set "restest-hires"
    And the texture set "restest-hires" resolution is set to 4096
    And I create a Global Material texture set "restest-lores"
    And I upload texture "blue_color.png" to texture set "restest-lores"
    And the texture set "restest-lores" resolution is set to 512
    When I view the Global Materials texture sets
    And I search texture sets for "restest"
    And I filter texture sets by minimum resolution "2K+"
    Then the texture set "restest-hires" should be listed
    And the texture set "restest-lores" should not be listed
