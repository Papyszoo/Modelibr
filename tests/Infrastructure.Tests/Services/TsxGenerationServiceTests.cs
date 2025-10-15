using Xunit;
using Infrastructure.Services;

namespace Infrastructure.Tests.Services;

public class TsxGenerationServiceTests
{
    [Fact]
    public void GenerateTsxCode_WithAmbientLight_ShouldGenerateValidCode()
    {
        // Arrange
        var service = new TsxGenerationService();
        var stageName = "MyCustomStage";
        var configJson = @"{
            ""lights"": [
                {
                    ""id"": ""light-1"",
                    ""type"": ""ambient"",
                    ""color"": ""#ffffff"",
                    ""intensity"": 0.5
                }
            ]
        }";

        // Act
        var result = service.GenerateTsxCode(stageName, configJson);

        // Assert
        Assert.Contains("function MyCustomStage", result);
        Assert.Contains("import { JSX, ReactNode } from 'react'", result);
        Assert.Contains("import { Canvas } from '@react-three/fiber'", result);
        Assert.Contains("import { OrbitControls } from '@react-three/drei'", result);
        Assert.Contains("<ambientLight color=\"#ffffff\" intensity={0.5} />", result);
        Assert.Contains("export default MyCustomStage", result);
    }

    [Fact]
    public void GenerateTsxCode_WithDirectionalLight_ShouldGenerateValidCode()
    {
        // Arrange
        var service = new TsxGenerationService();
        var stageName = "DirectionalStage";
        var configJson = @"{
            ""lights"": [
                {
                    ""id"": ""light-1"",
                    ""type"": ""directional"",
                    ""color"": ""#ffcc00"",
                    ""intensity"": 1.0,
                    ""position"": [5, 10, 5]
                }
            ]
        }";

        // Act
        var result = service.GenerateTsxCode(stageName, configJson);

        // Assert
        Assert.Contains("function DirectionalStage", result);
        Assert.Contains("<directionalLight color=\"#ffcc00\" intensity={1} position={[5, 10, 5]} castShadow />", result);
    }

    [Fact]
    public void GenerateTsxCode_WithSpotLight_ShouldGenerateValidCode()
    {
        // Arrange
        var service = new TsxGenerationService();
        var stageName = "SpotStage";
        var configJson = @"{
            ""lights"": [
                {
                    ""id"": ""light-1"",
                    ""type"": ""spot"",
                    ""color"": ""#ff0000"",
                    ""intensity"": 2.0,
                    ""position"": [0, 5, 0],
                    ""angle"": 0.523,
                    ""penumbra"": 0.2,
                    ""distance"": 10,
                    ""decay"": 1
                }
            ]
        }";

        // Act
        var result = service.GenerateTsxCode(stageName, configJson);

        // Assert
        Assert.Contains("function SpotStage", result);
        Assert.Contains("<spotLight color=\"#ff0000\" intensity={2}", result);
        Assert.Contains("position={[0, 5, 0]}", result);
        Assert.Contains("angle={0.523}", result);
        Assert.Contains("penumbra={0.2}", result);
        Assert.Contains("distance={10}", result);
        Assert.Contains("decay={1}", result);
    }

    [Fact]
    public void GenerateTsxCode_WithInvalidComponentName_ShouldSanitize()
    {
        // Arrange
        var service = new TsxGenerationService();
        var stageName = "My-Invalid@Stage#Name!";
        var configJson = @"{""lights"": []}";

        // Act
        var result = service.GenerateTsxCode(stageName, configJson);

        // Assert
        Assert.Contains("function MyInvalidStageName", result);
        Assert.Contains("MyInvalidStageNameProps", result);
    }

    [Fact]
    public void GenerateTsxCode_WithNumberStartingName_ShouldPrefixWithStage()
    {
        // Arrange
        var service = new TsxGenerationService();
        var stageName = "123Stage";
        var configJson = @"{""lights"": []}";

        // Act
        var result = service.GenerateTsxCode(stageName, configJson);

        // Assert
        Assert.Contains("function Stage123Stage", result);
    }

    [Fact]
    public void GenerateTsxCode_WithMultipleLights_ShouldGenerateAllLights()
    {
        // Arrange
        var service = new TsxGenerationService();
        var stageName = "ComplexStage";
        var configJson = @"{
            ""lights"": [
                {
                    ""id"": ""light-1"",
                    ""type"": ""ambient"",
                    ""color"": ""#404040"",
                    ""intensity"": 0.3
                },
                {
                    ""id"": ""light-2"",
                    ""type"": ""directional"",
                    ""color"": ""#ffffff"",
                    ""intensity"": 1.0,
                    ""position"": [10, 10, 10]
                },
                {
                    ""id"": ""light-3"",
                    ""type"": ""point"",
                    ""color"": ""#00ff00"",
                    ""intensity"": 0.8,
                    ""position"": [-5, 3, -5],
                    ""distance"": 20,
                    ""decay"": 2
                }
            ]
        }";

        // Act
        var result = service.GenerateTsxCode(stageName, configJson);

        // Assert
        Assert.Contains("<ambientLight", result);
        Assert.Contains("<directionalLight", result);
        Assert.Contains("<pointLight", result);
        Assert.Contains("color=\"#404040\"", result);
        Assert.Contains("color=\"#ffffff\"", result);
        Assert.Contains("color=\"#00ff00\"", result);
    }
}
