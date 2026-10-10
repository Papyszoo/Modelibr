namespace Infrastructure.Persistence;

/// <summary>
/// The SQL that rewrites persisted thumbnail / preview paths from an absolute
/// path (uploads root + content-addressed tail) to the uploads-root-relative form
/// every other stored file uses.
/// </summary>
/// <remarks>
/// <para>
/// The tail is the only machine-independent part of the path, so it is extracted
/// rather than a fixed prefix being stripped - any uploads root, on any machine,
/// normalises to the same relative path. The statement is idempotent: a value
/// already in the relative form extracts to itself and the <c>WHERE</c> excludes
/// it, so running twice changes nothing. A value that does not carry a
/// content-addressed tail (an older, non-addressed path) is left alone.
/// </para>
/// <para>
/// The separator between the tail's segments may be a forward slash or a
/// backslash: rows written on Windows carry the backslash <c>Path.Combine</c>
/// produced. Both are matched, and the extracted tail is re-emitted with forward
/// slashes so the relative form is identical on every platform.
/// </para>
/// <para>
/// Lives outside the migration so both the migration and its idempotency test run
/// exactly the same statements.
/// </para>
/// </remarks>
public static class ThumbnailPathNormalizer
{
    // HashBasedFileStorage's relative layout: <2 hex>/<2 hex>/<64 hex>. The
    // separator class accepts a forward slash or a backslash.
    private const string TwoHex = "[0-9a-fA-F]{2}";
    private const string Hash = "[0-9a-fA-F]{64}";
    private const string Separator = @"[/\\]";

    // Consumes everything up to the tail, then keeps the three groups.
    private const string ExtractPattern = $"^.*({TwoHex}){Separator}({TwoHex}){Separator}({Hash})$";

    // Searches for the tail anywhere in the value.
    private const string TailPattern = $"({TwoHex}){Separator}({TwoHex}){Separator}({Hash})$";

    // Re-emit the tail with forward slashes regardless of what it carried.
    private const string ReplaceWith = @"'\1/\2/\3'";

    /// <summary>Every table/column that can hold a thumbnail or preview path.</summary>
    public static readonly IReadOnlyList<(string Table, string Column)> Columns =
    [
        ("Thumbnails", "ThumbnailPath"),
        ("Thumbnails", "PngThumbnailPath"),
        ("TextureSets", "ThumbnailPath"),
        ("TextureSets", "PngThumbnailPath"),
        ("EnvironmentMapVariants", "ThumbnailPath"),
        ("Materials", "ThumbnailPath"),
        ("Materials", "PngThumbnailPath"),
        ("Vfx", "ThumbnailPath"),
        ("SceneRenders", "FilePath"),
    ];

    public static string StatementFor(string table, string column)
    {
        var normalized =
            $"regexp_replace(\"{column}\", '{ExtractPattern}', {ReplaceWith})";
        return $"UPDATE \"{table}\" " +
               $"SET \"{column}\" = {normalized} " +
               $"WHERE \"{column}\" IS NOT NULL " +
               $"AND \"{column}\" ~ '{TailPattern}' " +
               $"AND {normalized} <> \"{column}\";";
    }

    public static IEnumerable<string> Statements() =>
        Columns.Select(column => StatementFor(column.Table, column.Column));
}
