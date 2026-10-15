using System.Text;

namespace Infrastructure.Services;

/// <summary>
/// The SQL a managed dump is made of, plus the one line of it the reader has to
/// understand again.
/// </summary>
/// <remarks>
/// Deliberately pure and public: the statements are the format, and a format that
/// can only be produced by a live database is a format nobody can test.
/// </remarks>
public static class ManagedDumpStatements
{
    /// <summary>
    /// Tables and their dumpable columns.
    /// </summary>
    /// <remarks>
    /// <c>is_generated = 'ALWAYS'</c> covers both an identity column declared
    /// <c>ALWAYS</c> and a computed column. Neither can be written to: including
    /// one makes every COPY for that table fail, and omitting a column that the
    /// server fills in is exactly what the server wants.
    /// </remarks>
    public const string SelectTables = """
        SELECT c.table_name,
               array_agg(c.column_name ORDER BY c.ordinal_position)
                 FILTER (WHERE c.is_generated <> 'ALWAYS')::text[]
        FROM information_schema.columns c
        JOIN information_schema.tables t
          ON t.table_schema = c.table_schema AND t.table_name = c.table_name
        WHERE c.table_schema = 'public'
          AND t.table_type = 'BASE TABLE'
        GROUP BY c.table_name
        ORDER BY c.table_name;
        """;

    /// <summary>Every foreign key between two user tables, as child → parent.</summary>
    public const string SelectForeignKeys = """
        SELECT child.relname, parent.relname
        FROM pg_constraint con
        JOIN pg_class child ON child.oid = con.conrelid
        JOIN pg_class parent ON parent.oid = con.confrelid
        JOIN pg_namespace ns ON ns.oid = child.relnamespace
        WHERE con.contype = 'f'
          AND ns.nspname = 'public'
        ORDER BY child.relname, parent.relname;
        """;

    /// <summary>Sequences and where they currently stand, for the setval trailer.</summary>
    public const string SelectSequences = """
        SELECT schemaname, sequencename, last_value
        FROM pg_sequences
        WHERE schemaname = 'public'
        ORDER BY sequencename;
        """;

    /// <summary>
    /// One statement that empties every dumped table.
    /// </summary>
    /// <remarks>
    /// <c>RESTART IDENTITY</c> resets the sequences along with the rows; the dump's
    /// <c>setval</c> trailer then puts them back where the data left them, which is
    /// the only way a restored library can keep handing out ids that are not taken.
    /// </remarks>
    public static string Truncate(IReadOnlyList<ManagedTableBlock> tables)
    {
        if (tables.Count == 0)
        {
            // Still valid SQL, and it keeps the writer free of a special case.
            return "TRUNCATE TABLE pg_catalog.pg_class RESTART IDENTITY CASCADE;";
        }

        return $"TRUNCATE TABLE {string.Join(", ", tables.Select(t => Quote(t.Table)))} " +
               "RESTART IDENTITY CASCADE;";
    }

    /// <summary>The <c>COPY ... TO STDOUT</c> that exports a table's rows.</summary>
    public static string CopyOut(ManagedTableBlock table) =>
        $"COPY {Quote(table.Table)} ({ColumnList(table)}) TO STDOUT (FORMAT text);";

    /// <summary>The <c>COPY ... FROM STDIN</c> that loads a table's rows.</summary>
    public static string CopyIn(ManagedTableBlock table) =>
        $"COPY {Quote(table.Table)} ({ColumnList(table)}) FROM STDIN (FORMAT text);";

    /// <summary>
    /// Reads back a <c>COPY ... FROM STDIN</c> header. Returns false for any other
    /// line, which is how the reader tells data from structure.
    /// </summary>
    public static bool TryParseCopyIn(
        string line,
        out string table,
        out IReadOnlyList<string> columns)
    {
        const string prefix = "COPY ";
        const string marker = " FROM STDIN (FORMAT text);";
        table = string.Empty;
        columns = [];

        if (!line.StartsWith(prefix, StringComparison.Ordinal) ||
            !line.EndsWith(marker, StringComparison.Ordinal))
        {
            return false;
        }

        var rest = line[prefix.Length..^marker.Length];
        var open = rest.IndexOf(" (", StringComparison.Ordinal);
        if (open < 0 || !rest.EndsWith(')'))
        {
            return false;
        }

        table = Unquote(rest[..open].Trim());
        columns = rest[(open + 2)..^1]
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(Unquote)
            .ToList();
        return true;
    }

    /// <summary>
    /// The trailer that puts a sequence back where the restored rows left it.
    /// </summary>
    /// <param name="lastValue">
    /// Where the sequence stood, or null when it had never been advanced - an
    /// empty table. <paramref name="isCalled"/> carries the difference: a sequence
    /// that has handed out nothing must return 1 next, not <c>last_value + 1</c>.
    /// </param>
    public static string SetSequence(string schema, string name, long? lastValue, bool isCalled)
    {
        var qualified = $"{Quote(schema)}.{Quote(name)}";
        return isCalled && lastValue.HasValue
            ? $"SELECT pg_catalog.setval('{qualified.Replace("'", "''")}', {lastValue.Value}, true);"
            : $"SELECT pg_catalog.setval('{qualified.Replace("'", "''")}', 1, false);";
    }

    /// <summary>
    /// Double-quotes an identifier, doubling any quote inside it.
    /// </summary>
    /// <remarks>
    /// Every identifier here comes from the catalog rather than from user input,
    /// but a table named <c>we"ird</c> is legal and must not produce a syntax error
    /// in the middle of a backup.
    /// </remarks>
    public static string Quote(string identifier) =>
        $"\"{identifier.Replace("\"", "\"\"", StringComparison.Ordinal)}\"";

    private static string ColumnList(ManagedTableBlock table) =>
        string.Join(", ", table.Columns.Select(Quote));

    private static string Unquote(string identifier) =>
        identifier.Length >= 2 && identifier[0] == '"' && identifier[^1] == '"'
            ? identifier[1..^1].Replace("\"\"", "\"", StringComparison.Ordinal)
            : identifier;
}
