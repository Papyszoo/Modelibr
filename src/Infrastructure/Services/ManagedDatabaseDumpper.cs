using System.Text;
using Microsoft.Extensions.Logging;
using Npgsql;

namespace Infrastructure.Services;

/// <summary>
/// A database dump Modelibr writes and restores itself, with no PostgreSQL client
/// binaries involved.
/// </summary>
/// <remarks>
/// <para>
/// The desktop runtime ships an embedded PostgreSQL server, and that distribution
/// carries <c>initdb</c>, <c>pg_ctl</c> and <c>postgres</c> - not <c>pg_dump</c>,
/// <c>pg_restore</c>, <c>psql</c> or <c>pg_isready</c>. Backups therefore could not
/// run in the packaged app at all, and the honest thing (a warning and a disabled
/// button) still left users with no way to protect their work.
/// </para>
/// <para>
/// So the dump is <c>COPY</c> text streamed through Npgsql, which the app already
/// depends on to talk to that server. The output is deliberately a valid
/// <c>psql</c> script: someone with the client tools can read a backup with
/// <c>psql -f</c>, and the old binaries can still restore an archive this code
/// wrote.
/// </para>
/// <para>
/// The format is data-only. It is not a schema export, which is the right shape
/// here: the app owns its schema through EF Core migrations, and a restore
/// replays the user's <i>rows</i> onto a schema this build migrates to. The
/// archive records the migration it was taken at so a restore can land on the
/// matching schema first and let the normal boot finish the job - the same
/// upgrade path a <c>pg_restore</c> of an old dump took.
/// </para>
/// </remarks>
public static class ManagedDumpFormat
{
    /// <summary>Format identifier written to the manifest and to the dump header.</summary>
    public const string Id = "copy-text-v1";

    /// <summary>First line of a managed dump. Also the "is this ours?" test.</summary>
    public const string HeaderLine = $"-- modelibr managed dump {Id}";

    /// <summary>Table EF Core owns; never dumped, because the migrator owns it.</summary>
    public const string MigrationsHistoryTable = "__EFMigrationsHistory";
}

/// <summary>
/// One step of a dump's body, in the order it must be performed: either a SQL
/// statement to execute, or a table's rows to load.
/// </summary>
/// <remarks>
/// A single ordered list rather than "all statements, then all rows", because the
/// order between the two is what makes the load correct - the truncate has to empty
/// the tables before any row goes in, and the sequence reset has to follow the rows.
/// </remarks>
public sealed record ManagedDumpItem
{
    private ManagedDumpItem(ManagedTableBlock? block, string? statement)
    {
        Block = block;
        Statement = statement;
    }

    /// <summary>The table's rows, or null when this item is a statement.</summary>
    public ManagedTableBlock? Block { get; }

    /// <summary>The SQL to execute, or null when this item is a row block.</summary>
    public string? Statement { get; }

    public static ManagedDumpItem ForBlock(ManagedTableBlock block) => new(block, null);

    public static ManagedDumpItem ForStatement(string statement) => new(null, statement);
}

/// <summary>A parsed managed dump: what it claims to be, and what it contains.</summary>
public sealed record ManagedDumpDocument(
    ManagedDumpHeader Header,
    IReadOnlyList<ManagedDumpItem> Items)
{
    /// <summary>Just the row blocks, in file order.</summary>
    public IEnumerable<ManagedTableBlock> Blocks => Items
        .Select(item => item.Block)
        .OfType<ManagedTableBlock>();
}

/// <summary>What the header of a managed dump says about itself.</summary>
/// <param name="PostgresMajorVersion">Server the dump was taken from.</param>
/// <param name="LastAppliedMigration">
/// The newest migration recorded in <c>__EFMigrationsHistory</c> when the dump was
/// taken, or null for a database that had never been migrated. Migration ids are
/// timestamp-prefixed, so the highest id is the one applied last.
/// </param>
public sealed record ManagedDumpHeader(int PostgresMajorVersion, string? LastAppliedMigration);

/// <summary>One table's copy block: what to read, and in what column order.</summary>
public sealed record ManagedTableBlock(string Table, IReadOnlyList<string> Columns)
{
    /// <summary>
    /// The block's data lines, one row each. Empty on the writing side - the
    /// writer streams rows straight from the server - and populated by
    /// <see cref="ManagedDatabaseDumpper.Parse"/>.
    /// </summary>
    public IReadOnlyList<string> Lines { get; init; } = [];
}

/// <summary>
/// Writes and reads managed dumps.
/// </summary>
/// <remarks>
/// Kept free of EF Core so it can be exercised against a bare Npgsql connection,
/// which is also how the boot-time restore uses it - that runs before the
/// application's service provider exists.
/// </remarks>
public sealed class ManagedDatabaseDumpper
{
    private readonly ILogger _logger;

    /// <param name="logger">
    /// Non-generic on purpose: <c>BackupService</c> builds one of these per backup
    /// and has its own logger to hand, and a dumpper that forced
    /// <c>ILogger&lt;ManagedDatabaseDumpper&gt;</c> would make that impossible.
    /// </param>
    public ManagedDatabaseDumpper(ILogger logger)
    {
        _logger = logger;
    }

    // ── writing ────────────────────────────────────────────────────────────────

    /// <summary>
    /// Streams every user table into <paramref name="output"/> as a psql-compatible
    /// script, and returns what the header recorded.
    /// </summary>
    public async Task<ManagedDumpHeader> WriteAsync(
        NpgsqlConnection connection,
        Stream output,
        CancellationToken cancellationToken = default)
    {
        var major = await GetPostgresMajorVersionAsync(connection, cancellationToken);
        var lastMigration = await GetLastAppliedMigrationAsync(connection, cancellationToken);
        var tables = await GetTablesInDependencyOrderAsync(connection, cancellationToken);

        // UTF-8 without a BOM: the archive's SHA-256 is taken over these exact
        // bytes, and a BOM would become part of the first line on restore.
        await using var writer = new StreamWriter(output, new UTF8Encoding(false), leaveOpen: true)
        {
            AutoFlush = false,
            NewLine = "\n",
        };

        await writer.WriteLineAsync(ManagedDumpFormat.HeaderLine);
        await writer.WriteLineAsync($"-- postgres-major: {major}");
        await writer.WriteLineAsync($"-- last-migration: {lastMigration ?? "none"}");
        await writer.WriteLineAsync();
        await writer.WriteLineAsync("-- Truncating every table in one statement, before any data is loaded:");
        await writer.WriteLineAsync("-- no row can trip a foreign key and no load order is required.");
        await writer.WriteLineAsync(ManagedDumpStatements.Truncate(tables));
        await writer.WriteLineAsync();

        long totalRows = 0;
        foreach (var table in tables)
        {
            totalRows += await WriteTableAsync(connection, writer, table, cancellationToken);
        }

        await WriteSequenceValuesAsync(connection, writer, cancellationToken);
        await writer.FlushAsync();

        _logger.LogInformation(
            "Managed dump written: {Tables} table(s), {Rows} row(s), PostgreSQL {Major}.",
            tables.Count,
            totalRows,
            major);
        return new ManagedDumpHeader(major, lastMigration);
    }

    private static async Task<long> WriteTableAsync(
        NpgsqlConnection connection,
        TextWriter writer,
        ManagedTableBlock table,
        CancellationToken cancellationToken)
    {
        // No blank line between the COPY header and the data. It reads nicer, and it
        // is wrong: inside a COPY block every line is a row, so a blank line is a row
        // with no fields at all - which PostgreSQL rejects on the first integer
        // column. pg_dump emits no such line either, and neither does psql expect one.
        await writer.WriteLineAsync(ManagedDumpStatements.CopyIn(table));

        // The export streams: a table larger than memory is written a row at a
        // time rather than materialised as one string.
        using var reader = await connection.BeginTextExportAsync(
            ManagedDumpStatements.CopyOut(table), cancellationToken);

        long rows = 0;
        while (await reader.ReadLineAsync(cancellationToken) is { } line)
        {
            await writer.WriteLineAsync(line);
            rows++;
        }

        // "\." is what ends a COPY block for both psql and the reader below.
        await writer.WriteLineAsync(@"\.");
        await writer.WriteLineAsync();
        return rows;
    }

    private static async Task WriteSequenceValuesAsync(
        NpgsqlConnection connection,
        TextWriter writer,
        CancellationToken cancellationToken)
    {
        await using var command = new NpgsqlCommand(ManagedDumpStatements.SelectSequences, connection);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);

        var wroteHeader = false;
        while (await reader.ReadAsync(cancellationToken))
        {
            if (!wroteHeader)
            {
                await writer.WriteLineAsync("-- Sequences, so the next insert does not collide with restored rows.");
                await writer.WriteLineAsync();
                wroteHeader = true;
            }

            var schema = reader.GetString(0);
            var name = reader.GetString(1);
            var lastValue = reader.IsDBNull(2) ? (long?)null : reader.GetInt64(2);
            await writer.WriteLineAsync(ManagedDumpStatements.SetSequence(
                schema,
                name,
                lastValue,
                isCalled: lastValue.HasValue));
        }
    }

    // ── reading ────────────────────────────────────────────────────────────────

    /// <summary>
    /// Reads just the header, so a caller can act on what the dump claims to be -
    /// migrate to its schema - before touching any data.
    /// </summary>
    public static ManagedDumpHeader ReadHeader(Stream input)
    {
        using var reader = new StreamReader(input, Encoding.UTF8, leaveOpen: true);
        return ReadHeader(reader);
    }

    private static ManagedDumpHeader ReadHeader(TextReader reader)
    {
        var first = reader.ReadLine();
        if (first is null || !string.Equals(first.Trim(), ManagedDumpFormat.HeaderLine, StringComparison.Ordinal))
        {
            throw new InvalidDataException(
                "Not a Modelibr managed dump: the file does not start with the expected header.");
        }

        var major = 0;
        string? lastMigration = null;
        for (var line = reader.ReadLine(); line is not null; line = reader.ReadLine())
        {
            if (line.Length == 0) break;
            if (line.StartsWith("-- postgres-major: ", StringComparison.Ordinal))
            {
                _ = int.TryParse(line["-- postgres-major: ".Length..], out major);
            }
            else if (line.StartsWith("-- last-migration: ", StringComparison.Ordinal))
            {
                var value = line["-- last-migration: ".Length..].Trim();
                lastMigration = value == "none" ? null : value;
            }
        }

        return new ManagedDumpHeader(major, lastMigration);
    }

    /// <summary>
    /// Replaces the contents of every table named in the dump with the dump's rows.
    /// </summary>
    /// <remarks>
    /// One transaction, so a failure anywhere leaves the database exactly as it was:
    /// a half-restored library is worse than an un-restored one, because the user
    /// cannot tell which half is real.
    /// </remarks>
    public async Task RestoreAsync(
        NpgsqlConnection connection,
        Stream input,
        CancellationToken cancellationToken = default)
    {
        // The reader owns the stream, so it is disposed before the connection is
        // reused for the transaction below.
        var dump = Parse(input);
        _logger.LogInformation(
            "Restoring managed dump (format {Format}, PostgreSQL {Major}, migration {Migration}) with {Tables} table block(s).",
            ManagedDumpFormat.Id,
            dump.Header.PostgresMajorVersion,
            dump.Header.LastAppliedMigration ?? "none",
            dump.Blocks.Count());

        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
        await using (var setRole = new NpgsqlCommand(
            "SET LOCAL session_replication_role = replica;", connection, transaction))
        {
            // Foreign keys and triggers stop firing for the load. PostgreSQL only
            // lets a superuser do this, so a role that cannot is not fatal: the
            // blocks are already in dependency order from the dump, which is what
            // makes the load valid either way.
            try
            {
                await setRole.ExecuteNonQueryAsync(cancellationToken);
            }
            catch (PostgresException ex)
            {
                _logger.LogWarning(
                    ex,
                    "Could not disable foreign-key checks for this restore because the " +
                    "database role is not a superuser. Restoring in the dump's dependency " +
                    "order instead, which only a circular set of table relationships " +
                    "could still defeat.");
            }
        }

        // In file order, not "all the statements then all the rows": the truncate
        // that empties the tables has to run BEFORE the rows go in, and the
        // setval trailer that puts the sequences back has to run after. Reordering
        // them is what left the pre-existing rows in place and failed the load with
        // a duplicate-key error on the first table.
        foreach (var item in dump.Items)
        {
            if (item.Block is not null)
            {
                var block = item.Block;
                await using var importer = await connection.BeginTextImportAsync(
                    ManagedDumpStatements.CopyIn(block), cancellationToken);
                foreach (var line in block.Lines)
                {
                    await importer.WriteLineAsync(line.AsMemory(), cancellationToken);
                }
                continue;
            }

            await using var command = new NpgsqlCommand(item.Statement!, connection, transaction);
            await command.ExecuteNonQueryAsync(cancellationToken);
        }

        await transaction.CommitAsync(cancellationToken);
    }

    /// <summary>
    /// Splits a dump into its header and its body, preserving file order.
    /// </summary>
    /// <remarks>
    /// The body is a sequence of items rather than a list of blocks with a separate
    /// list of statements, because the order between them is load-bearing: the
    /// truncate precedes the rows and the setval trailer follows them.
    /// </remarks>
    public static ManagedDumpDocument Parse(Stream input)
    {
        using var reader = new StreamReader(input, Encoding.UTF8, leaveOpen: true);

        var header = ReadHeader(reader);
        var items = new List<ManagedDumpItem>();
        List<string>? lines = null;
        var table = string.Empty;
        IReadOnlyList<string> columns = [];

        while (reader.ReadLine() is { } line)
        {
            if (lines is null)
            {
                if (ManagedDumpStatements.TryParseCopyIn(line, out var parsedTable, out var parsedColumns))
                {
                    table = parsedTable;
                    columns = parsedColumns;
                    lines = [];
                    continue;
                }

                // Outside a block, a line is either a comment, blank, or a statement
                // the writer intends to be run - the truncate and the setvals.
                if (line.Length > 0 && !line.StartsWith("--", StringComparison.Ordinal))
                {
                    items.Add(ManagedDumpItem.ForStatement(line));
                }
                continue;
            }

            // Inside a copy block every line is data until the terminator.
            if (line == @"\.")
            {
                items.Add(ManagedDumpItem.ForBlock(
                    new ManagedTableBlock(table, columns) { Lines = lines }));
                lines = null;
                continue;
            }

            lines.Add(line);
        }

        return new ManagedDumpDocument(header, items);
    }

    // ── introspection ──────────────────────────────────────────────────────────

    private static async Task<int> GetPostgresMajorVersionAsync(
        NpgsqlConnection connection,
        CancellationToken cancellationToken)
    {
        await using var command = new NpgsqlCommand("SHOW server_version_num;", connection);
        var output = ((string?)await command.ExecuteScalarAsync(cancellationToken))?.Trim();
        if (!int.TryParse(output, out var versionNumber))
        {
            throw new InvalidOperationException(
                $"Could not read the PostgreSQL server version (got '{output}').");
        }

        // server_version_num is 160003 for 16.3 - the major is the leading part.
        return versionNumber / 10000;
    }

    private static async Task<string?> GetLastAppliedMigrationAsync(
        NpgsqlConnection connection,
        CancellationToken cancellationToken)
    {
        // Asked whether the table exists rather than queried and caught. The dump
        // runs inside a transaction, and a statement that fails aborts it: catching
        // the "no such table" error would leave the transaction dead and every later
        // command in the same dump would fail with 25P02. Which is exactly what the
        // pre-migration backup of a never-migrated database is.
        await using (var exists = new NpgsqlCommand(
            $"SELECT to_regclass('public.\"{ManagedDumpFormat.MigrationsHistoryTable}\"') IS NOT NULL;",
            connection))
        {
            if (await exists.ExecuteScalarAsync(cancellationToken) is not true)
            {
                return null;
            }
        }

        await using var command = new NpgsqlCommand(
            $"""
             SELECT "MigrationId" FROM "{ManagedDumpFormat.MigrationsHistoryTable}"
             ORDER BY "MigrationId" DESC LIMIT 1;
             """,
            connection);
        return (string?)await command.ExecuteScalarAsync(cancellationToken);
    }

    private static async Task<List<ManagedTableBlock>> GetTablesInDependencyOrderAsync(
        NpgsqlConnection connection,
        CancellationToken cancellationToken)
    {
        var tables = await ReadTablesAsync(connection, cancellationToken);
        var parents = await ReadForeignKeyParentsAsync(connection, cancellationToken);
        return OrderByDependency(tables, parents);
    }

    private static async Task<Dictionary<string, ManagedTableBlock>> ReadTablesAsync(
        NpgsqlConnection connection,
        CancellationToken cancellationToken)
    {
        await using var command = new NpgsqlCommand(ManagedDumpStatements.SelectTables, connection);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);

        var tables = new Dictionary<string, ManagedTableBlock>(StringComparer.Ordinal);
        while (await reader.ReadAsync(cancellationToken))
        {
            var table = reader.GetString(0);
            if (string.Equals(table, ManagedDumpFormat.MigrationsHistoryTable, StringComparison.Ordinal))
            {
                continue;
            }

            // Read as a string array, which the ::text[] cast in the query is what
            // makes possible: information_schema's column_name is a "name", and a
            // bare name[] cannot be read as a string.
            var columns = reader.IsDBNull(1)
                ? []
                : reader.GetFieldValue<string[]>(1).ToList();

            tables[table] = new ManagedTableBlock(table, columns);
        }

        return tables;
    }

    private static async Task<Dictionary<string, List<string>>> ReadForeignKeyParentsAsync(
        NpgsqlConnection connection,
        CancellationToken cancellationToken)
    {
        await using var command = new NpgsqlCommand(ManagedDumpStatements.SelectForeignKeys, connection);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);

        var parents = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        while (await reader.ReadAsync(cancellationToken))
        {
            var child = reader.GetString(0);
            var parent = reader.GetString(1);
            if (!parents.TryGetValue(child, out var list))
            {
                list = [];
                parents[child] = list;
            }

            // A table with a two-column key names the same parent twice.
            if (!list.Contains(parent, StringComparer.Ordinal))
            {
                list.Add(parent);
            }
        }

        return parents;
    }

    /// <summary>
    /// Orders tables so a table is written after everything it points at.
    /// </summary>
    /// <remarks>
    /// The load truncates every table before inserting, so the rows cannot trip a
    /// foreign key when the role is a superuser and the checks are disabled. The
    /// order is what makes the load correct on a role that cannot disable them, and
    /// it costs nothing when the checks are off. A cycle - which EF does not produce
    /// - breaks on name instead of failing the backup.
    /// </remarks>
    private static List<ManagedTableBlock> OrderByDependency(
        Dictionary<string, ManagedTableBlock> tables,
        Dictionary<string, List<string>> parents)
    {
        var ordered = new List<ManagedTableBlock>(tables.Count);
        var pending = new HashSet<string>(tables.Keys, StringComparer.Ordinal);

        while (pending.Count > 0)
        {
            var ready = pending
                .Where(name => !(parents.TryGetValue(name, out var list) &&
                                 list.Any(parent => pending.Contains(parent))))
                .OrderBy(name => name, StringComparer.Ordinal)
                .ToList();

            if (ready.Count == 0)
            {
                ready.Add(pending.Min(StringComparer.Ordinal)!);
            }

            foreach (var name in ready)
            {
                ordered.Add(tables[name]);
                pending.Remove(name);
            }
        }

        return ordered;
    }
}
