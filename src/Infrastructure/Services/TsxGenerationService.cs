using System.Text;
using System.Text.Json;
using Application.Abstractions.Services;

namespace Infrastructure.Services;

public sealed class TsxGenerationService : ITsxGenerationService
{
    public string GenerateTsxCode(string stageName, string configurationJson)
    {
        var config = JsonSerializer.Deserialize<StageConfiguration>(configurationJson);
        if (config == null)
        {
            throw new ArgumentException("Invalid configuration JSON", nameof(configurationJson));
        }

        var sb = new StringBuilder();
        var componentName = SanitizeComponentName(stageName);

        // Add imports
        sb.AppendLine("import { JSX, ReactNode } from 'react';");
        sb.AppendLine("import { Canvas } from '@react-three/fiber';");
        sb.AppendLine("import { OrbitControls } from '@react-three/drei';");
        sb.AppendLine();

        // Add component type
        sb.AppendLine($"type {componentName}Props = {{");
        sb.AppendLine("  children?: ReactNode;");
        sb.AppendLine("};");
        sb.AppendLine();

        // Add component function
        sb.AppendLine($"function {componentName}({{");
        sb.AppendLine("  children,");
        sb.AppendLine($"}}: {componentName}Props): JSX.Element {{");
        sb.AppendLine("  return (");
        sb.AppendLine("    <Canvas shadows camera={{ position: [10, 10, 10], fov: 50 }}>");
        sb.AppendLine("      {/* Lights */}");

        // Generate lights
        if (config.Lights != null)
        {
            foreach (var light in config.Lights)
            {
                sb.AppendLine(GenerateLightCode(light));
            }
        }

        sb.AppendLine();
        sb.AppendLine("      {/* Your 3D objects */}");
        sb.AppendLine("      {children}");
        sb.AppendLine();
        sb.AppendLine("      {/* Controls */}");
        sb.AppendLine("      <OrbitControls />");
        sb.AppendLine("    </Canvas>");
        sb.AppendLine("  );");
        sb.AppendLine("}");
        sb.AppendLine();
        sb.AppendLine($"export default {componentName};");

        return sb.ToString();
    }

    private string GenerateLightCode(LightConfig light)
    {
        return light.Type switch
        {
            "ambient" => $"      <ambientLight color=\"{light.Color}\" intensity={{{light.Intensity}}} />",
            
            "directional" => GenerateDirectionalLight(light),
            
            "point" => GeneratePointLight(light),
            
            "spot" => GenerateSpotLight(light),
            
            _ => ""
        };
    }

    private string GenerateDirectionalLight(LightConfig light)
    {
        var position = light.Position != null && light.Position.Length == 3 
            ? $"[{light.Position[0]}, {light.Position[1]}, {light.Position[2]}]" 
            : "[5, 5, 5]";

        return $"      <directionalLight color=\"{light.Color}\" intensity={{{light.Intensity}}} position={{{position}}} castShadow />";
    }

    private string GeneratePointLight(LightConfig light)
    {
        var position = light.Position != null && light.Position.Length == 3 
            ? $"[{light.Position[0]}, {light.Position[1]}, {light.Position[2]}]" 
            : "[5, 5, 5]";

        var distance = light.Distance ?? 0;
        var decay = light.Decay ?? 2;

        return $"      <pointLight color=\"{light.Color}\" intensity={{{light.Intensity}}} position={{{position}}} distance={{{distance}}} decay={{{decay}}} castShadow />";
    }

    private string GenerateSpotLight(LightConfig light)
    {
        var position = light.Position != null && light.Position.Length == 3 
            ? $"[{light.Position[0]}, {light.Position[1]}, {light.Position[2]}]" 
            : "[5, 5, 5]";

        var angle = light.Angle ?? Math.PI / 6;
        var penumbra = light.Penumbra ?? 0.1;
        var distance = light.Distance ?? 0;
        var decay = light.Decay ?? 2;

        return $"      <spotLight color=\"{light.Color}\" intensity={{{light.Intensity}}} position={{{position}}} angle={{{angle}}} penumbra={{{penumbra}}} distance={{{distance}}} decay={{{decay}}} castShadow />";
    }

    private string SanitizeComponentName(string name)
    {
        // Remove invalid characters and ensure it starts with uppercase
        var sanitized = new string(name.Where(c => char.IsLetterOrDigit(c) || c == '_').ToArray());
        if (string.IsNullOrEmpty(sanitized) || char.IsDigit(sanitized[0]))
        {
            sanitized = "Stage" + sanitized;
        }
        
        // Capitalize first letter
        if (sanitized.Length > 0 && char.IsLower(sanitized[0]))
        {
            sanitized = char.ToUpper(sanitized[0]) + sanitized.Substring(1);
        }

        return sanitized;
    }

    private class StageConfiguration
    {
        public LightConfig[]? Lights { get; set; }
    }

    private class LightConfig
    {
        public string Id { get; set; } = string.Empty;
        public string Type { get; set; } = string.Empty;
        public string Color { get; set; } = "#ffffff";
        public double Intensity { get; set; } = 1.0;
        public double[]? Position { get; set; }
        public double[]? Target { get; set; }
        public double? Angle { get; set; }
        public double? Penumbra { get; set; }
        public double? Distance { get; set; }
        public double? Decay { get; set; }
    }
}
