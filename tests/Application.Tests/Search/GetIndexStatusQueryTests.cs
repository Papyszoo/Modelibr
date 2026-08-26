using Application.Abstractions.Repositories;
using Application.Extraction.Derivation;
using Application.Search;
using Moq;
using Xunit;

namespace Application.Tests.Search;

/// <summary>
/// "Is the library findable yet" - the question an agent asks in a loop while an import
/// runs, and the one it previously answered by searching for something and guessing.
///
/// The distinction the whole thing turns on is derived vs indexed: an asset can have a
/// derived row and no search document, in which case it exists and search cannot see it.
/// A status that reported one number would let a caller conclude the library was ready.
/// </summary>
public class GetIndexStatusQueryTests
{
    private readonly Mock<IAssetDerivationRepository> _derivations = new();
    private readonly Mock<IAssetSearchDocumentRepository> _documents = new();

    private GetIndexStatusQueryHandler Handler =>
        new(_derivations.Object, _documents.Object, new DerivationOptions { DeriveVersion = 2 });

    private void GivenDerived(params (string AssetType, int Derived, int Stale)[] counts) =>
        _derivations
            .Setup(r => r.CountDerivedByTypeAsync(2, It.IsAny<CancellationToken>()))
            .ReturnsAsync(counts.ToList());

    private void GivenIndexed(params (string AssetType, int Count)[] counts) =>
        _documents
            .Setup(r => r.CountIndexedAssetsByTypeAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(counts.ToDictionary(c => c.AssetType, c => c.Count, StringComparer.Ordinal));

    [Fact]
    public async Task Derived_But_Not_Indexed_Is_Reported_As_The_Gap_It_Is()
    {
        // The store-import defect's exact shape: assets that exist, with thumbnails, that
        // search cannot find. The note has to name the remedy, or the number is trivia.
        GivenDerived(("Model", 100, 0));
        GivenIndexed(("Model", 78));

        var result = await Handler.Handle(new GetIndexStatusQuery(), CancellationToken.None);

        Assert.Equal(100, result.Value.TotalDerived);
        Assert.Equal(78, result.Value.TotalIndexed);
        Assert.Contains(result.Value.Notes, n => n.Contains("Model 22") && n.Contains("reindex_search"));
    }

    [Fact]
    public async Task Rows_Behind_The_Current_Derive_Version_Are_Called_Stale_Not_Missing()
    {
        // They still answer, from an older projection. Reporting them as unindexed would
        // send the caller to the wrong remedy.
        GivenDerived(("Model", 100, 30));
        GivenIndexed(("Model", 100));

        var result = await Handler.Handle(new GetIndexStatusQuery(), CancellationToken.None);

        Assert.Equal(30, result.Value.TotalStale);
        Assert.Contains(result.Value.Notes, n => n.Contains("trigger_rederive"));
        Assert.DoesNotContain(result.Value.Notes, n => n.Contains("reindex_search"));
    }

    [Fact]
    public async Task A_Family_With_Documents_And_No_Derived_Rows_Is_Still_Reported()
    {
        // A projection left behind by a wiped derivation layer. Joining off the derived side
        // would hide it, and it is exactly the state worth seeing.
        GivenDerived(("Model", 10, 0));
        GivenIndexed(("Model", 10), ("Sprite", 4));

        var result = await Handler.Handle(new GetIndexStatusQuery(), CancellationToken.None);

        var sprite = result.Value.Families.Single(f => f.AssetType == "Sprite");
        Assert.Equal(0, sprite.Derived);
        Assert.Equal(4, sprite.Indexed);
    }

    [Fact]
    public async Task A_Library_That_Is_Fully_Indexed_Says_So_Rather_Than_Going_Quiet()
    {
        // An empty notes list reads as "nothing was checked". The caller needs the positive
        // statement to end its wait loop on.
        GivenDerived(("Model", 10, 0));
        GivenIndexed(("Model", 10));

        var result = await Handler.Handle(new GetIndexStatusQuery(), CancellationToken.None);

        Assert.Contains(result.Value.Notes, n => n.Contains("Everything derived is indexed"));
    }
}
