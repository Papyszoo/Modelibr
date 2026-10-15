@texture-set @toolbar-search
Feature: Texture Set toolbar search

  Coverage trap for the shared list-toolbar's debounced server-side
  search on the Texture Sets page. These scenarios exist to catch the
  classes of regressions that previously slipped through:
    - Mid-typing re-renders that unmount the search input and drop focus
      (the bug that motivated, and then unmotivated, the `placeholderData`
      workaround on the list query).
    - Search-name filtering moving from client-side to server-side without
      a test asserting the server actually narrowed the results.

  Scenario: Search input retains focus across debounce/refetch cycle
    Given I am on the texture sets page
    When I open the toolbar search panel
    And I type "kind" one character at a time into the toolbar search
    Then the toolbar search input should remain focused
    And the toolbar search input value should equal "kind"

  Scenario: Toolbar search narrows the texture-set grid by name
    Given I am on the texture sets page
    When I create a universal texture set "search_match_uni" via API
    And I create a universal texture set "search_other_uni" via API
    And I switch to the "Global Materials" kind tab
    And I narrow the toolbar search to "search_match"
    # Both assertions run while the filter is applied: the "see" step below narrows the
    # grid to the full unique name and clears the search afterwards so the name filter
    # cannot mask later steps, which would leave this one asserting against an unfiltered
    # grid - the card it forbids is exactly what clearing brings back.
    Then I should not see texture set "search_other_uni" in the grid
    And I should see texture set "search_match_uni" in the grid
