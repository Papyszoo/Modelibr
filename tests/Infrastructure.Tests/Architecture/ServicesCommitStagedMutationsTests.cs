using System.Text.RegularExpressions;
using Xunit;

namespace Infrastructure.Tests.Architecture;

/// <summary>
/// Companion gate to <see cref="RepositoriesDontSelfCommitTests"/>: repositories
/// only stage mutations, and the CommandHandlerUnitOfWorkDecorator commits for
/// command handlers — but services under src/Infrastructure/Services run
/// outside the command pipeline (background tasks, own DI scopes), so nothing
/// commits for them. A service that stages repository mutations without also
/// calling IUnitOfWork silently drops its writes.
///
/// Real regression this catches: after the unit-of-work migration,
/// BlenderInstallationService.PersistSettingsAsync staged the
/// BlenderEnabled/BlenderPath settings via ISettingRepository but never
/// committed, so a completed Blender install left the feature disabled
/// (blend-upload E2E scenarios failed at "backend has Blender integration
/// enabled").
/// </summary>
public class ServicesCommitStagedMutationsTests
{
    [Fact]
    public void ServicesStagingRepositoryMutations_AlsoUseUnitOfWork()
    {
        var servicesDir = FindServicesDirectory();

        var offenders = new List<string>();

        foreach (var path in Directory.EnumerateFiles(servicesDir, "*.cs", SearchOption.TopDirectoryOnly))
        {
            var content = File.ReadAllText(path);

            var usesRepository = Regex.IsMatch(content, @"\bI[A-Za-z]+Repository\b");
            var stagesMutations = Regex.IsMatch(content, @"\.(AddAsync|UpdateAsync|DeleteAsync|RemoveAsync)\s*\(");
            var commits = content.Contains("IUnitOfWork");

            if (usesRepository && stagesMutations && !commits)
            {
                offenders.Add(Path.GetFileName(path));
            }
        }

        Assert.True(offenders.Count == 0,
            "The following services stage repository mutations but never resolve " +
            "IUnitOfWork, so their writes are staged and dropped (no command-handler " +
            "decorator commits outside the command pipeline): " +
            string.Join(", ", offenders) +
            ". Resolve IUnitOfWork from the same scope as the repository and call " +
            "SaveChangesAsync after staging. See the backend-patterns skill, " +
            "\"Transactions — unit of work\" section.");
    }

    private static string FindServicesDirectory()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir != null && !File.Exists(Path.Combine(dir.FullName, "Modelibr.sln")))
        {
            dir = dir.Parent;
        }

        if (dir == null)
        {
            throw new InvalidOperationException(
                $"Could not locate Modelibr.sln by walking up from {AppContext.BaseDirectory}");
        }

        var servicesDir = Path.Combine(dir.FullName, "src", "Infrastructure", "Services");
        if (!Directory.Exists(servicesDir))
        {
            throw new InvalidOperationException($"Expected directory not found: {servicesDir}");
        }

        return servicesDir;
    }
}
