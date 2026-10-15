@batch2 @scenes @scene-render-mcp @slow
Feature: Rendering a scene over MCP
    render_scene draws a scene through the same component the editor uses and
    hands the agent a picture plus the counts that make it readable. It needs
    the asset-processor's headless renderer, so this lives in the slow lane
    beside the REST render round trip.

    Background:
        Given a scene MCP model exists

    Scenario: An agent renders a scene and collects the picture
        Given an agent-created scene with one placed model exists
        When an agent renders the scene over MCP
        Then the MCP render should report every placed node loaded
        And the scene render image should be a PNG
        When an agent collects the render over MCP
        Then the MCP render collection should report the picture
