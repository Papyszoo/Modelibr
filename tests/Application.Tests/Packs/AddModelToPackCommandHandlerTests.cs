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
    private readonly Mock<IDateTimeProvider> _dateTimeProvider = new();

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

        var handler = new AddModelToPackCommandHandler(
            _packRepository.Object,
            _modelRepository.Object,
            _batchUploadRepository.Object,
            _dateTimeProvider.Object);

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

        var handler = new AddModelToPackCommandHandler(
            _packRepository.Object,
            _modelRepository.Object,
            _batchUploadRepository.Object,
            _dateTimeProvider.Object);

        var result = await handler.Handle(new AddModelToPackCommand(pack.Id, model.Id), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(pack.Id, batchUpload.PackId);
        Assert.Equal("pack", batchUpload.UploadType);
        _packRepository.Verify(x => x.UpdateAsync(It.IsAny<Pack>(), It.IsAny<CancellationToken>()), Times.Never);
        _batchUploadRepository.Verify(x => x.UpdateAsync(batchUpload, It.IsAny<CancellationToken>()), Times.Once);
    }
}
