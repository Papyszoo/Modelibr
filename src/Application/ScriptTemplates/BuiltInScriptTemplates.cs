namespace Application.ScriptTemplates;

/// <summary>
/// App-shipped starter templates. These are read-only and always present; custom
/// templates are stored in the database and merged on top of these.
/// </summary>
public static class BuiltInScriptTemplates
{
    public const string IdPrefix = "builtin:";

    public static readonly IReadOnlyList<ScriptTemplateDto> All = new[]
    {
        new ScriptTemplateDto(
            $"{IdPrefix}unity-monobehaviour",
            "Unity MonoBehaviour",
            "csharp",
            "A standard Unity component with Start and Update.",
            """
            using UnityEngine;

            public class NewBehaviour : MonoBehaviour
            {
                // Called once before the first frame update.
                void Start()
                {
                }

                // Called once per frame.
                void Update()
                {
                }
            }
            """,
            true),

        new ScriptTemplateDto(
            $"{IdPrefix}threejs-fragment-shader",
            "three.js Fragment Shader (GLSL)",
            "glsl",
            "ShaderToy-compatible fragment shader; renders live in the preview pane.",
            """
            // Fragment shader — animated gradient.
            // Uniforms iResolution / iTime / iMouse are provided by the preview.
            void mainImage(out vec4 fragColor, in vec2 fragCoord) {
                vec2 uv = fragCoord / iResolution.xy;
                vec3 col = 0.5 + 0.5 * cos(iTime + uv.xyx + vec3(0.0, 2.0, 4.0));
                fragColor = vec4(col, 1.0);
            }
            """,
            true),

        new ScriptTemplateDto(
            $"{IdPrefix}threejs-vertex-shader",
            "three.js Vertex Shader (GLSL)",
            "glsl",
            "A pass-through vertex shader using three.js built-in attributes.",
            """
            // Vertex shader — passes UVs through to the fragment stage.
            varying vec2 vUv;

            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
            """,
            true),

        new ScriptTemplateDto(
            $"{IdPrefix}threejs-tsl-material",
            "three.js TSL Material",
            "javascript",
            "A node material authored with the Three Shading Language (TSL).",
            """
            // three.js TSL (Three Shading Language) node material.
            import * as THREE from 'three'
            import { color, uv, sin, time, mix } from 'three/tsl'

            const material = new THREE.MeshBasicNodeMaterial()

            // Animate between two colors along the V axis.
            material.colorNode = mix(
              color(0x001133),
              color(0x33ddff),
              sin(uv().y.mul(10.0).add(time)).mul(0.5).add(0.5)
            )

            export default material
            """,
            true),

        new ScriptTemplateDto(
            $"{IdPrefix}lua-module",
            "Lua Module",
            "lua",
            "A minimal Lua module skeleton.",
            """
            local M = {}

            function M.new()
              local self = {}
              return self
            end

            return M
            """,
            true),

        new ScriptTemplateDto(
            $"{IdPrefix}python-script",
            "Python Script",
            "python",
            "A Python script with a main entry point.",
            """
            def main():
                pass


            if __name__ == "__main__":
                main()
            """,
            true),
    };
}
