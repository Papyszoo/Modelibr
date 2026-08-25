using Application.Abstractions;
using Application.Abstractions.Repositories;
using Application.Packs;
using Application.Tests;
using Domain.Models;
using Domain.Services;
using Moq;
using Xunit;

namespace Application.Tests.Packs;

public class AddModelToPackCommandHandlerTests
{
    private readonly Mock<IPackRepository> _packRepository = new();
    private readonly Mock<IModelRepository> _modelRepository = new();
    private readonly Mock<IBatchUploadRepository> _batchUploadRepository = new();
    private readonly Mock<IAssetSearchDocumentRepository> _searchDocumentRepository = new();
    private readonly Mock<IDateTimeProvider> _dateTimeProvider = new();
    private readonly Mock<IUnitOfWork> _unitOfWork = new();

    public AddModelToPackCommandHandlerTests()
    {
        _unitOfWork.Setup(u => u.InTransactionAsync(It.IsAny<Func<CancellationToken, Task<SharedKernel.Result<bool>>>>(), It.IsAny<CancellationToken>()))
            .Returns<Func<CancellationToken, Task<SharedKernel.Result<bool>>>, CancellationToken>((func, ct) => func(ct));
    }

    private AddModelToPackCommandHandler CreateHandler() => new(
        _packRepository.Object,
        _modelRepository.Object,
        _batchUploadRepository.Object,
        _searchDocumentRepository.Object,
        _dateTimeProvider.Object,
        _unitOfWork.Object);

    [Fact]
    public async Task Handle_WhenModelAlreadyAssociatedAndBatchUploadAlreadyMatches_ReturnsSuccessWithoutPersisting()
    {
        var now = DateTime.UtcNow;
        _dateTimeProvider.Setup(x => x.UtcNow).Returns(now);

        var pack = Pack.Create("Props", null, null, null, now).WithId(6);
        var model = Model.Create("Chair", now).WithId(1);
        pack.AddModel(model, now);

        var batchUpload = BatchUpload.Create("batch-1", "pack", 10, now, packId: pack.Id, modelId: model.Id);

        _packRepository.Setup(x => x.GetByIdAsync(pack.Id, It.IsAny<CancellationToken>())).ReturnsAsync(pack);
        _modelRepository.Setup(x => x.GetByIdForAssociationAsync(model.Id, It.IsAny<CancellationToken>())).ReturnsAsync(model);
        _batchUploadRepository.Setup(x => x.GetByModelIdAsync(model.Id, It.IsAny<CancellationToken>())).ReturnsAsync([batchUpload]);

        var handler = CreateHandler();

        var result = await handler.Handle(new AddModelToPackCommand(pack.Id, model.Id), CancellationToken.None);

        Assert.True(result.IsSuccess);
        _packRepository.Verify(x => x.UpdateAsync(It.IsAny<Pack>(), It.IsAny<CancellationToken>()), Times.Never);
        _batchUploadRepository.Verify(x => x.UpdateAsync(It.IsAny<BatchUpload>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Handle_WhenModelAlreadyAssociatedButBatchUploadNeedsRepair_UpdatesBatchUploadOnly()
    {
        var now = DateTime.UtcNow;
        _dateTimeProvider.Setup(x => x.UtcNow).Returns(now);

        var pack = Pack.Create("Props", null, null, null, now).WithId(6);
        var model = Model.Create("Chair", now).WithId(1);
        pack.AddModel(model, now);

        var batchUpload = BatchUpload.Create("batch-1", "model", 10, now, modelId: model.Id);

        _packRepository.Setup(x => x.GetByIdAsync(pack.Id, It.IsAny<CancellationToken>())).ReturnsAsync(pack);
        _modelRepository.Setup(x => x.GetByIdForAssociationAsync(model.Id, It.IsAny<CancellationToken>())).ReturnsAsync(model);
        _batchUploadRepository.Setup(x => x.GetByModelIdAsync(model.Id, It.IsAny<CancellationToken>())).ReturnsAsync([batchUpload]);

        var handler = CreateHandler();

        var result = await handler.Handle(new AddModelToPackCommand(pack.Id, model.Id), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(pack.Id, batchUpload.PackId);
        Assert.Equal("pack", batchUpload.UploadType);
        _packRepository.Verify(x => x.UpdateAsync(It.IsAny<Pack>(), It.IsAny<CancellationToken>()), Times.Never);
        _batchUploadRepository.Verify(x => x.UpdateAsync(batchUpload, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_WhenModelJoinsPack_MirrorsPackNamesOntoTheSearchProjection()
    {
        // Search reads projection state only. Adding a model to a pack does not re-derive
        // it, so without this mirror the asset stays unfindable by its pack name until
        // something else happens to trigger an extraction - which may be never.
        var now = DateTime.UtcNow;
        _dateTimeProvider.Setup(x => x.UtcNow).Returns(now);

        var pack = Pack.Create("POLYGON City", null, null, null, now).WithId(6);
        var model = Model.Create("Chair", now).WithId(1);

        _packRepository.Setup(x => x.GetByIdAsync(pack.Id, It.IsAny<CancellationToken>())).ReturnsAsync(pack);
        _modelRepository.Setup(x => x.GetByIdForAssociationAsync(model.Id, It.IsAny<CancellationToken>())).ReturnsAsync(model);
        _batchUploadRepository.Setup(x => x.GetByModelIdAsync(model.Id, It.IsAny<CancellationToken>())).ReturnsAsync([]);
        // The persisted state still predates this add - the handler must apply it itself
        // rather than trusting EF fix-up to have already happened.
        _packRepository.Setup(x => x.GetNamesByModelIdAsync(model.Id, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<string> { "Base Meshes" });

        var result = await CreateHandler().Handle(
            new AddModelToPackCommand(pack.Id, model.Id), CancellationToken.None);

        Assert.True(result.IsSuccess);
        _searchDocumentRepository.Verify(x => x.SetPacksForAssetAsync(
            "Model",
            model.Id,
            It.Is<IEnumerable<string>>(names =>
                names.Contains("Base Meshes") && names.Contains("POLYGON City")),
            It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_WhenModelIsAlreadyInThePack_DoesNotTouchTheProjection()
    {
        // A no-op add must stay a no-op: rewriting the projection would churn rows and
        // bump nothing useful.
        var now = DateTime.UtcNow;
        _dateTimeProvider.Setup(x => x.UtcNow).Returns(now);

        var pack = Pack.Create("Props", null, null, null, now).WithId(6);
        var model = Model.Create("Chair", now).WithId(1);
        pack.AddModel(model, now);

        _packRepository.Setup(x => x.GetByIdAsync(pack.Id, It.IsAny<CancellationToken>())).ReturnsAsync(pack);
        _modelRepository.Setup(x => x.GetByIdForAssociationAsync(model.Id, It.IsAny<CancellationToken>())).ReturnsAsync(model);
        _batchUploadRepository.Setup(x => x.GetByModelIdAsync(model.Id, It.IsAny<CancellationToken>())).ReturnsAsync([]);

        var result = await CreateHandler().Handle(
            new AddModelToPackCommand(pack.Id, model.Id), CancellationToken.None);

        Assert.True(result.IsSuccess);
        _searchDocumentRepository.Verify(x => x.SetPacksForAssetAsync(
            It.IsAny<string>(), It.IsAny<int>(), It.IsAny<IEnumerable<string>>(),
            It.IsAny<CancellationToken>()), Times.Never);
    }
}
