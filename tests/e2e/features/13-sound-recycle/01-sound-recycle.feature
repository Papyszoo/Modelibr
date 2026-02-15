@depends-on:sounds-setup @sounds @recycle
Feature: Sound Recycle and Restore
  Tests that sounds can be recycled (soft-deleted) and restored from the recycle bin.

  @sound-recycle
  Scenario: Soft-delete a sound and verify it appears in recycle bin
    Given I am on the sounds page
    And I upload a test sound "recycle-test-sound" from "test-tone.wav"
    When I soft-delete the sound "recycle-test-sound" via API
    And I navigate to the Recycled Files page
    Then I should see the sound in the recycled sounds section

  @sound-restore
  Scenario: Restoring a sound from recycle bin
    Given I am on the sounds page
    And I upload a test sound "restore-test-sound" from "test-tone.wav"
    When I soft-delete the sound "restore-test-sound" via API
    And I navigate to the Recycled Files page
    And I restore the recycled sound via UI
    Then the sound should be removed from the recycled sounds section
    And I navigate to the sounds page
    Then the sound "restore-test-sound" should be visible in the sound list

  @sound-permanent-delete
  Scenario: Permanently delete a sound from recycle bin
    Given I am on the sounds page
    And I upload a test sound "perm-delete-sound" from "test-tone.wav"
    When I soft-delete the sound "perm-delete-sound" via API
    And I navigate to the Recycled Files page
    And I click Delete Forever on the recycled sound
    And I confirm the sound permanent delete
    Then the sound should be removed from the recycled sounds section
