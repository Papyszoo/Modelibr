using Application.Abstractions.Files;
using Domain.ValueObjects;

namespace Application.Models;

/// <summary>
/// One extracted archive entry: its path within the archive and its bytes.
/// </summary>
public sealed record MultiFileImportEntry(string Path, byte[] Content);

/// <summary>
/// A primary model file paired with the auxiliary (external) files that live under its
/// directory - the <c>.bin</c> buffers and textures a loose <c>.gltf</c> references. The
/// auxiliary <see cref="AuxiliaryUpload.RelativePath"/> is expressed relative to the
/// primary's directory, matching how the primary glTF cites the URI.
/// </summary>
public sealed record ImportGroup(IFileUpload Primary, IReadOnlyList<AuxiliaryUpload> Auxiliaries);

/// <summary>An auxiliary file plus the relative path the primary references it by.</summary>
public sealed record AuxiliaryUpload(string RelativePath, IFileUpload File);

/// <summary>
/// Groups a flat set of archive entries into importable model groups by directory: each
/// primary model file (one <c>.gltf</c>/<c>.glb</c>/… per subfolder in the Khronos
/// glTF-Sample-Assets and Synty layouts) is paired with the non-primary files under its
/// directory as auxiliaries. Zip upload runs this after unzip; folder upload does the
/// equivalent grouping in the browser and posts each group directly.
/// </summary>
public static class MultiFileImportGrouping
{
    public static IReadOnlyList<ImportGroup> Group(IEnumerable<MultiFileImportEntry> entries)
    {
        var normalized = entries
            .Select(e => new MultiFileImportEntry(NormalizePath(e.Path), e.Content))
            .Where(e => !string.IsNullOrWhiteSpace(e.Path))
            .ToList();

        var primaries = normalized.Where(e => IsPrimary(e.Path)).ToList();
        var groups = new List<ImportGroup>();

        foreach (var primary in primaries)
        {
            var dir = DirectoryOf(primary.Path);

            var auxiliaries = normalized
                .Where(e =>
                    !ReferenceEquals(e, primary) &&
                    !IsPrimary(e.Path) &&
                    IsUnder(e.Path, dir))
                .Select(e => new AuxiliaryUpload(
                    RelativeTo(e.Path, dir),
                    new InMemoryFileUpload(FileNameOf(e.Path), e.Content)))
                .ToList();

            groups.Add(new ImportGroup(
                new InMemoryFileUpload(FileNameOf(primary.Path), primary.Content),
                auxiliaries));
        }

        return groups;
    }

    /// <summary>A primary is anything accepted as a standalone model upload (renderable or a DCC project).</summary>
    public static bool IsPrimary(string path) =>
        FileType.ValidateForModelUpload(FileNameOf(path)).IsSuccess;

    private static string NormalizePath(string path)
    {
        if (string.IsNullOrWhiteSpace(path))
            return string.Empty;

        var p = path.Trim().Replace('\\', '/');
        while (p.StartsWith("./", StringComparison.Ordinal))
            p = p[2..];
        return p.TrimStart('/');
    }

    private static string FileNameOf(string path)
    {
        var i = path.LastIndexOf('/');
        return i < 0 ? path : path[(i + 1)..];
    }

    private static string DirectoryOf(string path)
    {
        var i = path.LastIndexOf('/');
        return i < 0 ? string.Empty : path[..i];
    }

    private static bool IsUnder(string path, string dir) =>
        dir.Length == 0 ||
        path.StartsWith(dir + "/", StringComparison.OrdinalIgnoreCase);

    private static string RelativeTo(string path, string dir) =>
        dir.Length == 0 ? path : path[(dir.Length + 1)..];
}
