using Application.Scenes;
using Xunit;

namespace Application.Tests.Scenes;

/// <summary>
/// The gate that keeps the editor's scene types and the server's scene types the same
/// types.
///
/// The C# contract is the source; the TypeScript file is its output. If someone adds a
/// field to <c>SceneNode</c> and does not regenerate, this fails - which is the whole point,
/// because the alternative is an editor that silently drops a field an agent wrote.
///
/// To regenerate: <c>SCENE_CONTRACT_WRITE=1 dotnet test --filter
/// "FullyQualifiedName~SceneContractTypeScriptTests"</c>.
/// </summary>
public class SceneContractTypeScriptTests
{
    [Fact]
    public void Generated_TypeScript_Contract_Is_Up_To_Date()
    {
        var expected = SceneContractTypeScript.Generate();
        var path = Path.Combine(RepositoryRoot(), SceneContractTypeScript.OutputPath.Replace('/', Path.DirectorySeparatorChar));

        if (Environment.GetEnvironmentVariable("SCENE_CONTRACT_WRITE") == "1")
        {
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            File.WriteAllText(path, expected);
        }

        Assert.True(File.Exists(path), $"The generated scene contract is missing at {SceneContractTypeScript.OutputPath}. Regenerate it with SCENE_CONTRACT_WRITE=1.");

        // Line endings are normalised because the comparison is about content, and a
        // checkout on a machine configured for CRLF must not fail a build over it.
        var actual = File.ReadAllText(path).Replace("\r\n", "\n");
        Assert.True(
            actual == expected.Replace("\r\n", "\n"),
            $"{SceneContractTypeScript.OutputPath} is out of date with the C# scene contract. Regenerate it with SCENE_CONTRACT_WRITE=1.");
    }

    [Fact]
    public void Generated_Contract_Covers_Every_Contract_Type()
    {
        var generated = SceneContractTypeScript.Generate();

        // Named explicitly rather than reflected: this asserts that discovery found the
        // types we believe are in the schema, so a type dropped from the graph by mistake
        // fails here instead of vanishing from the editor's contract unnoticed.
        foreach (var type in new[]
                 {
                     "SceneDocument", "SceneNode", "SceneAssetRef", "ScenePrimitive", "SceneTransform",
                     "Vec3", "SceneMaterialBinding", "SceneLight", "SceneEnvironment", "SceneAnchor",
                 })
        {
            Assert.Contains($"export interface {type} {{", generated);
        }
    }

    [Fact]
    public void Versioned_Asset_References_Are_Emitted_As_A_Closed_Vocabulary()
    {
        var generated = SceneContractTypeScript.Generate();

        Assert.Contains("export type SceneAssetType = ", generated);
        Assert.Contains("assetType: SceneAssetType", generated);
        Assert.Contains("type: SceneLightType", generated);

        // An optional vocabulary keeps its nullability. Emitting it as a bare union would have
        // the editor demand a front axis on every node while the server treats it as absent.
        Assert.Contains("frontAxis?: SceneFrontAxis | null", generated);
    }

    private static string RepositoryRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "Modelibr.sln")))
        {
            dir = dir.Parent;
        }

        return dir?.FullName
            ?? throw new InvalidOperationException($"Could not locate Modelibr.sln by walking up from {AppContext.BaseDirectory}");
    }
}
