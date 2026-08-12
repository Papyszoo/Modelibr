using System.Reflection;
using Application.Abstractions;
using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Application.StoreImports;
using Domain.Models;
using Domain.Services;
using Moq;
using Xunit;

namespace Application.Tests.StoreImports;

public class CreateStoreImportCommandHandlerTests
{
    private const string Token = "super-secret-import-token-12345";

    private readonly Mock<IStoreImportJobRepository> _jobRepository = new();
    private readonly Mock<IStoreImportQueue> _queue = new();
    private readonly Mock<IDateTimeProvider> _clock = new();
    private readonly Mock<IUnitOfWork> _unitOfWork = new();

    public CreateStoreImportCommandHandlerTests()
    {
        _clock.Setup(x => x.UtcNow).Returns(new DateTime(2026, 7, 16, 0, 0, 0, DateTimeKind.Utc));
    }

    private CreateStoreImportCommandHandler CreateHandler()
        => new(_jobRepository.Object, _queue.Object, _clock.Object, _unitOfWork.Object);

    [Fact]
    public async Task Handle_When_ValidRequest_PersistsJobWithoutToken_And_EnqueuesTokenInMemoryOnly()
    {
        StoreImportJob? persistedJob = null;
        StoreImportWorkItem? enqueued = null;
        _jobRepository
            .Setup(r => r.AddAsync(It.IsAny<StoreImportJob>(), It.IsAny<CancellationToken>()))
            .Callback<StoreImportJob, CancellationToken>((j, _) => persistedJob = j)
            .ReturnsAsync((StoreImportJob j, CancellationToken _) => j);
        _queue
            .Setup(q => q.Enqueue(It.IsAny<StoreImportWorkItem>()))
            .Callback<StoreImportWorkItem>(w => enqueued = w)
            .Returns(true);

        var result = await CreateHandler().Handle(
            new CreateStoreImportCommand("https://store.example.com", "asset-1", Token), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.NotNull(persistedJob);
        Assert.NotNull(enqueued);

        // The token rides only in the in-memory work item...
        Assert.Equal(Token, enqueued!.ImportToken);

        // ...and appears nowhere on the persisted job (no property holds it, by design there
        // is no token field at all).
        foreach (var prop in typeof(StoreImportJob).GetProperties(BindingFlags.Public | BindingFlags.Instance))
        {
            var value = prop.GetValue(persistedJob) as string;
            Assert.True(value is null || !value.Contains(Token, StringComparison.Ordinal),
                $"Persisted job property {prop.Name} must not contain the import token.");
        }

        Assert.Equal("https://store.example.com", persistedJob!.StoreUrl);
        Assert.Equal("asset-1", persistedJob.StoreAssetId);
    }

    [Fact]
    public async Task Handle_When_HttpLocalhost_Succeeds()
    {
        _jobRepository.Setup(r => r.AddAsync(It.IsAny<StoreImportJob>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((StoreImportJob j, CancellationToken _) => j);
        _queue.Setup(q => q.Enqueue(It.IsAny<StoreImportWorkItem>())).Returns(true);

        var result = await CreateHandler().Handle(
            new CreateStoreImportCommand("http://localhost:9000", "asset-1", Token), CancellationToken.None);

        Assert.True(result.IsSuccess);
        _queue.Verify(q => q.Enqueue(It.IsAny<StoreImportWorkItem>()), Times.Once);
    }

    [Theory]
    [InlineData("http://store.example.com")] // http against a public host
    [InlineData("ftp://store.example.com")]  // wrong scheme
    [InlineData("not-a-url")]
    public async Task Handle_When_InsecureOrInvalidStoreUrl_Fails_WithoutEnqueue(string storeUrl)
    {
        var result = await CreateHandler().Handle(
            new CreateStoreImportCommand(storeUrl, "asset-1", Token), CancellationToken.None);

        Assert.True(result.IsFailure);
        _queue.Verify(q => q.Enqueue(It.IsAny<StoreImportWorkItem>()), Times.Never);
        _jobRepository.Verify(r => r.AddAsync(It.IsAny<StoreImportJob>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Handle_When_MissingToken_Fails(string token)
    {
        var result = await CreateHandler().Handle(
            new CreateStoreImportCommand("https://store.example.com", "asset-1", token), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("StoreImport.MissingToken", result.Error.Code);
    }
}
