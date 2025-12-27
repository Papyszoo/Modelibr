@depends-on:setup
Feature: Recycled Texture Sets
  Tests that texture sets can be recycled, restored, and permanently deleted

  Background:
    Given I am on the model list page

  @recycle-texture-set
  Scenario: Recycling a texture set removes it from the texture sets list
    Given I create a texture set "recycle-test-texture" with a color texture
    And I take a screenshot of the texture sets list
    When I delete the texture set "recycle-test-texture"
    Then the texture set should not be visible in the texture sets list
    And I take a screenshot after texture set deleted

  @texture-set-in-recycle-bin
  Scenario: Recycled texture set appears in recycle bin with thumbnail
    Given I create a texture set "bin-test-texture" with a color texture
    When I delete the texture set "bin-test-texture"
    And I navigate to the Recycled Files page
    Then I should see the texture set in the recycled texture sets section
    And I take a screenshot of the recycled texture sets section

  @restore-texture-set
  Scenario: Restoring a texture set adds it back to the list
    Given I create a texture set "restore-test-texture" with a color texture
    When I delete the texture set "restore-test-texture"
    And I navigate to the Recycled Files page
    And I restore the recycled texture set
    Then the texture set should be removed from the recycle bin
    And I navigate to the Texture Sets page
    Then the texture set "restore-test-texture" should be visible
    And I take a screenshot of the restored texture set
