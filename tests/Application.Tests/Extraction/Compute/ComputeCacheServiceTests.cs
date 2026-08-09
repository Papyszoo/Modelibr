using Application.Abstractions;
using Application.Abstractions.Repositories;
using Application.Extraction.Compute;
using Domain.Models;
using Domain.Services;
using Moq;
using Xunit;

namespace Application.Tests.Extraction.Compute;

public class ComputeCacheServiceTests
{
    private const string Hash = "abcd000000000000";

    private readonly Mock<IComputeCacheRepository> _repo = new();
    private readonly Mock<IDateTimeProvider> _clock = new();
    private readonly Mock<IUnitOfWork> _uow = new();
    private readonly ComputeCacheService _service;

    public ComputeCacheServiceTests()
    {
        _clock.Setup(x => x.UtcNow).Returns(new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc));
        _service = new ComputeCacheService(_repo.Object, _clock.Object, _uow.Object);
    }

    [Fact]
    public async Task GetOrCompute_ComputesOnceThenReusesForSecondAssetWithSameHash()
    {
        // First request: cache empty → compute runs and stores.
        AssetSearchStub(null);
        ComputeCacheEntry? stored = null;
        _repo.Setup(x => x.AddAsync(It.IsAny<ComputeCacheEntry>(), It.IsAny<CancellationToken>()))
            .Callback<ComputeCacheEntry, CancellationToken>((e, _) => stored = e)
            .Returns(Task.CompletedTask);

        var computeCalls = 0;
        Task<string> Compute(CancellationToken _)
        {
            computeCalls++;
            return Task.FromResult("{\"uvOverlap\":0.03}");
        }

        // Asset A (hash H) — pays for the compute.
        var first = await _service.GetOrComputeAsync(Hash, 1, "uv-overlap", Compute);
        Assert.Equal(1, computeCalls);
        Assert.Equal("{\"uvOverlap\":0.03}", first.Result);

        // Asset B — same geometry hash. Now the cache returns the stored entry.
        AssetSearchStub(stored);
        var second = await _service.GetOrComputeAsync(Hash, 1, "uv-overlap", Compute);

        // Proves the cache HIT: compute did NOT run again.
        Assert.Equal(1, computeCalls);
        Assert.Same(stored, second);
        // Only one durable write happened (the initial compute).
        _uow.Verify(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    private void AssetSearchStub(ComputeCacheEntry? entry) =>
        _repo.Setup(x => x.GetAsync(Hash, 1, "uv-overlap", It.IsAny<CancellationToken>()))
            .ReturnsAsync(entry);
}
