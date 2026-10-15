using Infrastructure.Persistence;
using Xunit;

namespace Infrastructure.Tests.Persistence;

/// <summary>
/// The migration SQL must recognise the content-addressed tail whatever separator
/// the row carries. Historical rows written on Windows hold backslashes from
/// <c>Path.Combine</c>; a forward-slash-only pattern would silently skip them and
/// leave machine-specific absolute paths behind. The rewrite must also re-emit
/// the tail with forward slashes. The behavioural check runs against PostgreSQL
/// in <c>ThumbnailPathMigrationIntegrationTests</c>; this pins the statement shape.
/// </summary>
public class ThumbnailPathNormalizerTests
{
    [Fact]
    public void Statement_AcceptsBothSeparators_AndNormalisesToForwardSlashes()
    {
        var sql = ThumbnailPathNormalizer.StatementFor("Vfx", "ThumbnailPath");

        // The separator class matches "/" or "\".
        Assert.Contains(@"[/\\]", sql);
        // The extracted tail is re-emitted with forward slashes.
        Assert.Contains(@"\1/\2/\3", sql);
        Assert.Contains("regexp_replace", sql);
        // Idempotent: the update is skipped when normalisation changes nothing.
        Assert.Contains("<>", sql);
    }

    [Fact]
    public void Statements_CoverEveryRegisteredThumbnailColumn()
    {
        var statements = ThumbnailPathNormalizer.Statements().ToList();

        Assert.Equal(ThumbnailPathNormalizer.Columns.Count, statements.Count);
        Assert.All(statements, statement => Assert.StartsWith("UPDATE ", statement));
    }
}
