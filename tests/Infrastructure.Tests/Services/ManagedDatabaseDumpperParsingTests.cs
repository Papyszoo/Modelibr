using System.Text;
using Infrastructure.Services;
using Xunit;

namespace Infrastructure.Tests.Services;

/// <summary>
/// The managed dump reader, against a dump written in the shape the writer
/// produces.
/// </summary>
/// <remarks>
/// These are the parse-level guarantees a round trip depends on. The database-level
/// behaviour - that a real dump restores real rows - is covered by the
/// backup/restore drill, which runs against a live PostgreSQL; what is pinned here
/// is everything that could go wrong with no database in the picture at all.
/// </remarks>
public sealed class ManagedDatabaseDumpperParsingTests
{
    private static string Dump(params string[] lines) =>
        string.Join("\n", lines) + "\n";

    private static byte[] Bytes(string text) => Encoding.UTF8.GetBytes(text);

    [Fact]
    public void ReadHeader_ReadsTheVersionAndTheMigrationItWasTakenAt()
    {
        var dump = Dump(
            ManagedDumpFormat.HeaderLine,
            "-- postgres-major: 16",
            "-- last-migration: 20260925172320_AddProjectReferenceLinks",
            string.Empty,
            "TRUNCATE TABLE \"Files\" RESTART IDENTITY CASCADE;",
            string.Empty);

        var header = ManagedDatabaseDumpper.ReadHeader(new MemoryStream(Bytes(dump)));

        Assert.Equal(16, header.PostgresMajorVersion);
        Assert.Equal("20260925172320_AddProjectReferenceLinks", header.LastAppliedMigration);
    }

    [Fact]
    public void ReadHeader_UnmigratedDatabase_ReportsNoMigration()
    {
        // The pre-migration backup of a database that has never been migrated is a
        // real case, and "none" must not be read as a migration called "none".
        var dump = Dump(
            ManagedDumpFormat.HeaderLine,
            "-- postgres-major: 17",
            "-- last-migration: none",
            string.Empty);

        var header = ManagedDatabaseDumpper.ReadHeader(new MemoryStream(Bytes(dump)));

        Assert.Equal(17, header.PostgresMajorVersion);
        Assert.Null(header.LastAppliedMigration);
    }

    [Fact]
    public void ReadHeader_RefusesSomethingThatIsNotAManagedDump()
    {
        // A pg_dump custom archive starts with binary. Reading it as text would
        // produce a nonsense header and, worse, a nonsense migration target.
        var pgDumpBytes = new byte[] { 0x50, 0x47, 0x44, 0x4D, 0x00, 0x01, 0x02, 0x03 };

        var error = Assert.Throws<InvalidDataException>(() =>
            ManagedDatabaseDumpper.ReadHeader(new MemoryStream(pgDumpBytes)));

        Assert.Contains("managed dump", error.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Parse_KeepsEveryTableBlockWithItsRows()
    {
        var dump = Dump(
            ManagedDumpFormat.HeaderLine,
            "-- postgres-major: 16",
            "-- last-migration: m1",
            string.Empty,
            "TRUNCATE TABLE \"Files\", \"Models\" RESTART IDENTITY CASCADE;",
            string.Empty,
            "COPY \"Files\" (\"Id\", \"FilePath\") FROM STDIN (FORMAT text);",
            "1\tone.glb",
            "2\t\\N",
            @"\.",
            string.Empty,
            "COPY \"Models\" (\"Id\", \"Name\") FROM STDIN (FORMAT text);",
            "7\tsword",
            @"\.",
            string.Empty);

        var blocks = ManagedDatabaseDumpper.Parse(new MemoryStream(Bytes(dump))).Blocks.ToList();

        Assert.Equal(2, blocks.Count);
        Assert.Equal("Files", blocks[0].Table);
        Assert.Equal(new[] { "Id", "FilePath" }, blocks[0].Columns);
        // A NULL is the two characters \N, not an empty field - the restore feeds
        // these lines back verbatim, so mistaking one for the other writes "".
        Assert.Equal(new[] { "1\tone.glb", "2\t\\N" }, blocks[0].Lines);
        Assert.Equal("Models", blocks[1].Table);
        Assert.Equal(new[] { "7\tsword" }, blocks[1].Lines);
    }

    [Fact]
    public void Parse_KeepsRowsThatLookLikeStatements()
    {
        // Data is data. A row whose text happens to start with "COPY " or "TRUNCATE"
        // must be restored as a row, not parsed as structure - otherwise a user
        // naming a file "TRUNCATE TABLE x" silently loses it.
        var dump = Dump(
            ManagedDumpFormat.HeaderLine,
            "-- postgres-major: 16",
            "-- last-migration: m1",
            string.Empty,
            "COPY \"Files\" (\"Id\", \"FilePath\") FROM STDIN (FORMAT text);",
            "1\tCOPY \"Files\" (\"Id\") FROM STDIN (FORMAT text);",
            "2\tTRUNCATE TABLE \"Files\" RESTART IDENTITY CASCADE;",
            @"\.",
            string.Empty);

        var blocks = ManagedDatabaseDumpper.Parse(new MemoryStream(Bytes(dump))).Blocks.ToList();

        var block = Assert.Single(blocks);
        Assert.Equal(2, block.Lines.Count);
        // Both survive as rows, and neither opened or closed a block: the second
        // one is not mistaken for a terminator, so the row after it is still here.
        Assert.Equal(
            "1\tCOPY \"Files\" (\"Id\") FROM STDIN (FORMAT text);",
            block.Lines[0]);
        Assert.Equal("2\tTRUNCATE TABLE \"Files\" RESTART IDENTITY CASCADE;", block.Lines[1]);
    }

    [Fact]
    public void Parse_EmptyTableBlock_ProducesNoRowsRatherThanFailing()
    {
        var dump = Dump(
            ManagedDumpFormat.HeaderLine,
            "-- postgres-major: 16",
            "-- last-migration: m1",
            string.Empty,
            "COPY \"Files\" (\"Id\") FROM STDIN (FORMAT text);",
            @"\.",
            string.Empty);

        var blocks = ManagedDatabaseDumpper.Parse(new MemoryStream(Bytes(dump))).Blocks.ToList();

        var block = Assert.Single(blocks);
        Assert.Empty(block.Lines);
    }

    [Fact]
    public void Parse_TreatsABlankLineInsideABlockAsARow()
    {
        // Every line inside a COPY block is a row, so a blank one is a row with no
        // fields - which PostgreSQL rejects on the first integer column of a table.
        // That is why the writer emits no blank line after the COPY header, and why
        // the reader does not skip one: silently dropping it would turn a corrupt
        // dump into a quiet data loss, and reordering the rows is not available.
        var dump = Dump(
            ManagedDumpFormat.HeaderLine,
            "-- postgres-major: 16",
            "-- last-migration: m1",
            string.Empty,
            "COPY \"Files\" (\"Id\") FROM STDIN (FORMAT text);",
            string.Empty,
            "1",
            @"\.",
            string.Empty);

        var blocks = ManagedDatabaseDumpper.Parse(new MemoryStream(Bytes(dump))).Blocks.ToList();

        var block = Assert.Single(blocks);
        Assert.Equal(2, block.Lines.Count);
        Assert.Equal(string.Empty, block.Lines[0]);
    }

    [Fact]
    public void Parse_KeepsStatementsAndRowsInFileOrder()
    {
        // This is the whole reason the parse returns one ordered list. The truncate
        // that empties the tables must run BEFORE the rows are loaded, and the setval
        // that puts the sequences back must run AFTER - loading first fails on the
        // first table with a duplicate-key error, because the old rows are still
        // there.
        var dump = Dump(
            ManagedDumpFormat.HeaderLine,
            "-- postgres-major: 16",
            "-- last-migration: m1",
            string.Empty,
            "-- Truncating every table in one statement, before any data is loaded:",
            "TRUNCATE TABLE \"Files\" RESTART IDENTITY CASCADE;",
            string.Empty,
            "COPY \"Files\" (\"Id\") FROM STDIN (FORMAT text);",
            "1",
            @"\.",
            string.Empty,
            "-- Sequences, so the next insert does not collide with restored rows.",
            "SELECT pg_catalog.setval('\"public\".\"Files_Id_seq\"', 1, true);",
            string.Empty);

        var items = ManagedDatabaseDumpper.Parse(new MemoryStream(Bytes(dump))).Items;

        Assert.Collection(
            items,
            item => Assert.Equal("TRUNCATE TABLE \"Files\" RESTART IDENTITY CASCADE;", item.Statement),
            item => Assert.Equal("Files", item.Block?.Table),
            item => Assert.StartsWith("SELECT pg_catalog.setval(", item.Statement!, StringComparison.Ordinal));
    }

    [Fact]
    public void Parse_DropsCommentsButKeepsTheStatements()
    {
        // Comments are for whoever opens the file; they are not something to execute,
        // and a comment inside a copy block is still data.
        var dump = Dump(
            ManagedDumpFormat.HeaderLine,
            "-- postgres-major: 16",
            "-- last-migration: m1",
            "-- a comment before any statement",
            string.Empty,
            "COPY \"Files\" (\"Id\", \"Note\") FROM STDIN (FORMAT text);",
            "1\t-- not a comment, a value",
            @"\.",
            string.Empty);

        var items = ManagedDatabaseDumpper.Parse(new MemoryStream(Bytes(dump))).Items;

        var block = Assert.Single(items).Block;
        Assert.NotNull(block);
        Assert.Equal(new[] { "1\t-- not a comment, a value" }, block!.Lines);
    }

    [Fact]
    public void Parse_KeepsTheWritersTableOrder()
    {
        // The writer emits tables in foreign-key dependency order, which is what
        // makes the load valid on a database role that cannot disable FK checks.
        // Re-sorting on the way in would throw that guarantee away.
        var dump = Dump(
            ManagedDumpFormat.HeaderLine,
            "-- postgres-major: 16",
            "-- last-migration: m1",
            string.Empty,
            "COPY \"Projects\" (\"Id\") FROM STDIN (FORMAT text);",
            "1",
            @"\.",
            string.Empty,
            "COPY \"ProjectLevels\" (\"Id\") FROM STDIN (FORMAT text);",
            "2",
            @"\.",
            string.Empty);

        var blocks = ManagedDatabaseDumpper.Parse(new MemoryStream(Bytes(dump))).Blocks.ToList();

        Assert.Equal(new[] { "Projects", "ProjectLevels" }, blocks.Select(b => b.Table));
    }
}
