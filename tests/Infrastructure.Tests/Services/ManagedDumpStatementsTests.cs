using Infrastructure.Services;
using Xunit;

namespace Infrastructure.Tests.Services;

/// <summary>
/// The managed dump format, tested as the format it is: statements in, statements
/// out, and a reader that recognises exactly what the writer produced.
///
/// The regressions these exist for are the ones that would corrupt a backup
/// quietly. A quoted identifier written wrong produces a syntax error halfway
/// through a user's only backup. A <c>setval</c> that says <c>is_called = true</c>
/// for an
/// empty table hands out an id that already exists. And a reader that stops at the
/// wrong terminator silently restores some tables and not others - the failure a
/// user cannot detect from inside the app.
/// </summary>
public sealed class ManagedDumpStatementsTests
{
    [Fact]
    public void Truncate_EmitsEveryTableInOneStatement()
    {
        var tables = new[]
        {
            new ManagedTableBlock("Files", new[] { "Id" }),
            new ManagedTableBlock("Models", new[] { "Id", "Name" }),
        };

        var sql = ManagedDumpStatements.Truncate(tables);

        // One statement, not one per table: truncating them together with CASCADE
        // is what lets the load below run in any order without a foreign key in
        // the middle of it.
        Assert.Equal(
            "TRUNCATE TABLE \"Files\", \"Models\" RESTART IDENTITY CASCADE;",
            sql);
    }

    [Fact]
    public void Truncate_EmptyTableList_StillProducesValidSql()
    {
        var sql = ManagedDumpStatements.Truncate([]);

        Assert.EndsWith("CASCADE;", sql, StringComparison.Ordinal);
        Assert.Contains("TRUNCATE TABLE", sql, StringComparison.Ordinal);
    }

    [Fact]
    public void CopyStatements_QuoteEveryIdentifier()
    {
        var table = new ManagedTableBlock("Project Levels", new[] { "Id", "Na\"me" });

        Assert.Equal(
            "COPY \"Project Levels\" (\"Id\", \"Na\"\"me\") TO STDOUT (FORMAT text);",
            ManagedDumpStatements.CopyOut(table));
        Assert.Equal(
            "COPY \"Project Levels\" (\"Id\", \"Na\"\"me\") FROM STDIN (FORMAT text);",
            ManagedDumpStatements.CopyIn(table));
    }

    [Fact]
    public void TryParseCopyIn_RoundTripsTheWritersOwnLine()
    {
        var table = new ManagedTableBlock("Project Levels", new[] { "Id", "Na\"me" });

        Assert.True(ManagedDumpStatements.TryParseCopyIn(
            ManagedDumpStatements.CopyIn(table), out var parsedTable, out var parsedColumns));

        Assert.Equal("Project Levels", parsedTable);
        Assert.Equal(new[] { "Id", "Na\"me" }, parsedColumns);
    }

    [Theory]
    [InlineData("")]
    [InlineData("TRUNCATE TABLE \"Files\" RESTART IDENTITY CASCADE;")]
    [InlineData("-- a comment")]
    [InlineData("1\trow\\N")]
    public void TryParseCopyIn_RejectsAnythingThatIsNotACopyHeader(string line)
    {
        // A data line must never be mistaken for structure: doing so would end the
        // block early and drop every row after it.
        Assert.False(ManagedDumpStatements.TryParseCopyIn(line, out _, out _));
    }

    [Fact]
    public void SetSequence_UsesThreeArgumentFormSoTheNextIdIsNotSkipped()
    {
        // The empty-table case is the one that bites: a sequence that has handed out
        // nothing has to return 1, and setval(seq, 1, true) would return 2 forever
        // after, colliding with the row the user is about to insert.
        Assert.Equal(
            "SELECT pg_catalog.setval('\"public\".\"Files_Id_seq\"', 1, false);",
            ManagedDumpStatements.SetSequence("public", "Files_Id_seq", lastValue: null, isCalled: false));

        Assert.Equal(
            "SELECT pg_catalog.setval('\"public\".\"Files_Id_seq\"', 42, true);",
            ManagedDumpStatements.SetSequence("public", "Files_Id_seq", lastValue: 42, isCalled: true));
    }

    [Fact]
    public void SetSequence_EscapesQuotesInTheSequenceName()
    {
        // Unreachable through the catalog, but a malformed name must not become a
        // SQL injection point in a file a user can hand-edit.
        var sql = ManagedDumpStatements.SetSequence("public", "it's\"", 1, isCalled: true);

        Assert.Contains("it''s\"", sql, StringComparison.Ordinal);
        Assert.DoesNotContain("'\"public\".\"it's", sql, StringComparison.Ordinal);
    }
}
