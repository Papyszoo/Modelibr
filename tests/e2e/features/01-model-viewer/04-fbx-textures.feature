@infra @fbx-textures
Feature: Textured FBX in the model viewer
    An FBX can carry its own texture. The repo's other FBX fixtures reference no
    image at all, so this uses a purpose-built binary FBX with an embedded
    (packed) texture. The viewer must apply that texture to the model, not just
    load its mesh: choosing the Embedded preset must leave a texture map on a
    mesh material in the scene.

    This is a client-side canvas mount, not a worker render, so it needs no
    thumbnail and stays on the fast lane with generous waits.

    Scenario: An uploaded textured FBX shows its embedded texture in the viewer
        Given a textured FBX model exists
        When I open the textured FBX in the viewer
        And I select preset "Embedded"
        Then the model should have "albedo" texture applied
