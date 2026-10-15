@infra @batch3 @mcp @blender-mcp
Feature: Blender operations over MCP
    The four Blender operations and the job poll. The E2E stack ships no Blender
    installation (installing it is the runtime path the @slow blend feature
    covers), so what these tools promise on this stack is the honest refusal,
    and get_job_status still answers about a job that does not exist.

    Background:
        Given a batch3 blender model exists

    Scenario Outline: A Blender operation is refused when Blender is not installed
        When an agent calls "<tool>" on the batch3 blender model
        Then the agent should be told Blender is not available

        Examples:
            | tool           |
            | generate_uvs   |
            | bake_textures  |
            | analyze_meshes |
            | convert_model  |

    Scenario: get_job_status reports a missing job
        When an agent asks for the status of a missing job
        Then the job status should report the job was not found
