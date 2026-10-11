@infra @mcp @blender-mcp @slow @timeout:720000
Feature: Blender operations run for real
    The four Blender operations against an installed Blender. The install is the
    same runtime step the .blend feature uses (nothing is baked into the image),
    so these run in the slow lane. Each scenario queues an operation, waits for
    the job to finish, and asserts what it actually produced rather than that it
    was merely accepted.

    Background:
        Given the backend has Blender integration enabled

    Scenario: Generating UVs writes a new inactive version
        Given a blender success model exists
        When an agent calls "generate_uvs" on the blender success model
        Then the operation should be queued as a job
        When the agent waits for the operation to finish
        Then the operation should be done
        And the operation should have written a new inactive version

    Scenario: Converting a model writes a new inactive version
        Given a blender success model exists
        When an agent calls "convert_model" on the blender success model
        Then the operation should be queued as a job
        When the agent waits for the operation to finish
        Then the operation should be done
        And the operation should have written a new inactive version
        And the conversion should report the target format "glb"

    Scenario: Measuring meshes reports part measurements
        Given a blender success model exists
        When an agent calls "analyze_meshes" on the blender success model
        Then the operation should be queued as a job
        When the agent waits for the operation to finish
        Then the operation should be done
        And the analysis should report measured mesh parts

    Scenario: Baking textures imports a texture set bound to the model
        Given a blender success model exists
        When an agent bakes textures on the blender success model
        Then the operation should be queued as a job
        When the agent waits for the operation to finish
        Then the operation should be done
        And the bake should have imported a texture set bound to the model

    Scenario: Baking a rigged blend for web collapses the rig into the new version
        Given a rigged blend model exists
        When an agent bakes the rigged blend for web
        Then the operation should be queued as a job
        When the agent waits for the operation to finish
        Then the operation should be done
        And the operation should have written a new inactive version
        And the baked version should carry the collapsed rig
