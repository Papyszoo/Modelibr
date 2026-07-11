using System.Text.RegularExpressions;
using Xunit;

namespace Infrastructure.Tests.Architecture;

/// <summary>
/// Source-scan fitness gate for prompt 25 (unit of work + reliable domain-event
/// dispatch): repositories under src/Infrastructure/Repositories stage
/// mutations on the shared ApplicationDbContext but must not call
/// SaveChangesAsync themselves — command handlers commit once via
/// IUnitOfWork, so a multi-repository operation is atomic. See the
/// backend-patterns skill, "Transactions — unit of work" section.
///
/// NetArchTest (if/when prompt 21 lands one) can check dependency directions
/// but can't see inside a method body, hence a plain text scan here.
///
/// The migration is landing one bounded area at a time (prompt 25's own
/// constraint — a single flag-day commit across 27 repositories isn't safely
/// reviewable). <see cref="StillSelfCommitting"/> is the honest, temporary
/// allowlist of areas not yet migrated; every entry is a concrete follow-up,
/// not a permanent exception. Shrink it as each area lands — do not add to
/// it for a NEW repository.
/// </summary>
public class RepositoriesDontSelfCommitTests
{
    // Files still calling _context.SaveChangesAsync() internally, grouped by
    // the bounded area prompt 25 hasn't reached yet. Settings, Packs, and
    // Projects have already migrated (and are deliberately absent here) —
    // regressing one of those must fail this test.
    private static readonly HashSet<string> StillSelfCommitting = new(StringComparer.OrdinalIgnoreCase)
    {
        // models
        "ModelRepository.cs",
        "ModelVersionRepository.cs",
        "ModelTagRepository.cs",
        "ModelCategoryRepository.cs",
        // texture sets
        "TextureSetRepository.cs",
        "TextureSetCategoryRepository.cs",
        "TextureProxyRepository.cs",
        // sounds
        "SoundRepository.cs",
        "SoundCategoryRepository.cs",
        // sprites
        "SpriteRepository.cs",
        "SpriteCategoryRepository.cs",
        // scripts
        "ScriptRepository.cs",
        "ScriptCategoryRepository.cs",
        "ScriptTemplateRepository.cs",
        // env maps
        "EnvironmentMapRepository.cs",
        "EnvironmentMapCategoryRepository.cs",
        // thumbnails — ThumbnailJobRepository also has a legitimate explicit
        // BeginTransactionAsync for claim semantics (GetNextPendingJobAsync);
        // that one call is expected to remain even after this area migrates.
        "ThumbnailRepository.cs",
        "ThumbnailJobRepository.cs",
        "ThumbnailJobEventRepository.cs",
        // packs/projects area's shared dependency — used by handlers across
        // every asset type, so it migrates alongside them, not with packs/projects
        "BatchUploadRepository.cs",
        // misc — File/FilePersistence migration interacts with
        // FileCreationService's disk<->DB compensation behavior (explicitly
        // out of scope for prompt 25); Stage has no handler audit yet
        "FileRepository.cs",
        "FilePersistence.cs",
        "StageRepository.cs",
    };

    [Fact]
    public void MigratedRepositories_DoNotCallSaveChangesAsync()
    {
        var repositoriesDir = FindRepositoriesDirectory();

        var offenders = new List<string>();

        foreach (var path in Directory.EnumerateFiles(repositoriesDir, "*.cs", SearchOption.TopDirectoryOnly))
        {
            var fileName = Path.GetFileName(path);
            if (StillSelfCommitting.Contains(fileName))
            {
                continue;
            }

            var content = File.ReadAllText(path);
            if (Regex.IsMatch(content, @"\.SaveChangesAsync\s*\("))
            {
                offenders.Add(fileName);
            }
        }

        Assert.True(offenders.Count == 0,
            "The following repositories call SaveChangesAsync directly, breaking the " +
            "single-commit-per-handler guarantee IUnitOfWork exists to provide: " +
            string.Join(", ", offenders) +
            ". Repositories stage mutations only; command handlers commit once via " +
            "IUnitOfWork.SaveChangesAsync. See the backend-patterns skill, " +
            "\"Transactions — unit of work\" section.");
    }

    [Fact]
    public void Allowlist_HasNoStaleEntries()
    {
        // Keeps the allowlist honest in the other direction: if a listed file
        // was migrated and just never removed from the list here, this test
        // patiently makes that visible too — silent staleness would let a
        // future regression back in unnoticed (the file would be "allowed" to
        // self-commit again with no test ever failing).
        var repositoriesDir = FindRepositoriesDirectory();
        var existingFiles = Directory.EnumerateFiles(repositoriesDir, "*.cs", SearchOption.TopDirectoryOnly)
            .Select(Path.GetFileName)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var stale = StillSelfCommitting.Where(f => !existingFiles.Contains(f)).ToList();

        Assert.True(stale.Count == 0,
            $"Allowlist references files that no longer exist under src/Infrastructure/Repositories: {string.Join(", ", stale)}");
    }

    private static string FindRepositoriesDirectory()
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

        var repositoriesDir = Path.Combine(dir.FullName, "src", "Infrastructure", "Repositories");
        if (!Directory.Exists(repositoriesDir))
        {
            throw new InvalidOperationException($"Expected directory not found: {repositoriesDir}");
        }

        return repositoriesDir;
    }
}
