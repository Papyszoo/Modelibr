@blend @timeout:720000 @slow
Feature: Blend File Upload and Processing
  Tests for uploading .blend files via WebDAV and frontend API paths.
  Verifies .glb extraction by the asset-processor and thumbnail generation.

  # ── New model creation ──────────────────────────────────────────────

  @blend-webdav-new-model
  Scenario: Create a new model via WebDAV PUT with a .blend file
    Given the backend has Blender integration enabled
    When I upload "test.blend" as a new model "BlendWebDavModel" via WebDAV PUT
    Then a model named "BlendWebDavModel" should exist in the API
    And the model "BlendWebDavModel" should have 1 version
    And the model "BlendWebDavModel" version 1 should have a .blend file
    And the model "BlendWebDavModel" should eventually have a thumbnail

  @blend-api-new-model
  Scenario: Create a new model via frontend API with a .blend file
    Given the backend has Blender integration enabled
    When I upload "test2.blend" as a new model via the REST API
    Then the uploaded model should exist in the API
    And the uploaded model should have 1 version
    And the uploaded model version 1 should have a .blend file
    And the uploaded model should eventually have a thumbnail

  # ── New version creation ────────────────────────────────────────────

  @blend-webdav-new-version
  Scenario: Create a new model version via WebDAV Safe Save
    Given the backend has Blender integration enabled
    And a model "BlendWebDavVersionModel" was created via WebDAV with "test.blend"
    When I save "test2.blend" to model "BlendWebDavVersionModel" via WebDAV Safe Save
    Then the model "BlendWebDavVersionModel" should have 2 versions
    And the model "BlendWebDavVersionModel" should eventually have a thumbnail

  @blend-api-new-version
  Scenario: Create a new model version via frontend API
    Given the backend has Blender integration enabled
    And a model "BlendApiVersionModel" was created via WebDAV with "test.blend"
    When I upload "test3.blend" as a new version of "BlendApiVersionModel" via API
    Then the model "BlendApiVersionModel" should have 2 versions
    And the model "BlendApiVersionModel" should eventually have a thumbnail

  # ── Deduplication / file reuse ──────────────────────────────────────

  @blend-dedup-across-models
  Scenario: Same .blend file uploaded to different models reuses the stored file
    Given the backend has Blender integration enabled
    And a model "BlendDedupA" was created from raw file "test4.blend" via WebDAV
    When I upload raw "test4.blend" as a new model "BlendDedupB" via WebDAV PUT
    Then the WebDAV PUT for "BlendDedupB" should indicate the model already exists

  @blend-dedup-same-model-version
  Scenario: Same .blend file uploaded as a new version of the same model is rejected
    Given the backend has Blender integration enabled
    And a model "BlendDedupSameModel" was created via WebDAV with "test.blend"
    When I save the same "test.blend" to model "BlendDedupSameModel" via WebDAV Safe Save
    Then the model "BlendDedupSameModel" should still have 1 version

  # ── Multi-file WebDAV upload ────────────────────────────────────────

  @blend-webdav-multi-file
  Scenario: Three .blend files dropped to WebDAV simultaneously each create a model with .glb and thumbnail
    Given the backend has Blender integration enabled
    When I upload 3 unique .blend files simultaneously via WebDAV PUT as models "BlendMultiA", "BlendMultiB", "BlendMultiC"
    Then a model named "BlendMultiA" should exist in the API
    And a model named "BlendMultiB" should exist in the API
    And a model named "BlendMultiC" should exist in the API
    And each of the models "BlendMultiA", "BlendMultiB", "BlendMultiC" should have 1 version with a .blend file
    And the model "BlendMultiA" should eventually have a thumbnail
    And the model "BlendMultiB" should eventually have a thumbnail
    And the model "BlendMultiC" should eventually have a thumbnail

  # ── Edge cases: zero-byte, AppleDouble, LOCK/UNLOCK, .blend1 ───────

  @blend-zero-byte
  Scenario: Zero-byte .blend file does not create a model
    Given the backend has Blender integration enabled
    When I upload an empty .blend file as "ZeroByteModel" via WebDAV PUT
    Then no model named "ZeroByteModel" should exist in the API

  @blend-appledouble
  Scenario: macOS AppleDouble ._filename files are silently ignored
    Given the backend has Blender integration enabled
    When I upload a file as "._test.blend" via WebDAV PUT
    Then no model named "._test" should exist in the API

  @blend-lock-unlock
  Scenario: WebDAV LOCK and UNLOCK are handled correctly
    Given the backend has Blender integration enabled
    When I send a LOCK request for "/modelibr/Models/LockTest.blend"
    Then the LOCK response should return a success status
    When I send an UNLOCK request for "/modelibr/Models/LockTest.blend"
    Then the UNLOCK response should return a success status

  @blend-blend1-operations
  Scenario: Blender .blend1 backup operations are silently ignored
    Given the backend has Blender integration enabled
    When I send a DELETE request for "/modelibr/Models/BackupTest.blend1"
    Then the DELETE response should be successful
    When I send a MOVE request to rename a file to .blend1
    Then the MOVE response should be successful

  # ── Temp file lifecycle ─────────────────────────────────────────────

  @blend-temp-lifecycle
  Scenario: Full Blender Safe Save temp file lifecycle
    Given the backend has Blender integration enabled
    And a model "TempLifecycle" was created via WebDAV with "test.blend"
    When I PUT a temp file for model "TempLifecycle"
    Then a HEAD request for the temp file should return HTTP 200
    When I MOVE the temp file to create a new version of "TempLifecycle"
    Then the model "TempLifecycle" should have 2 versions
