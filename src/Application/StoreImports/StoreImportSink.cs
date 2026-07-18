using Application.Abstractions.Files;
using Application.Abstractions.Messaging;
using Application.EnvironmentMaps;
using Application.Files;
using Application.Models;
using Application.Packs;
using Application.Sounds;
using Application.Sprites;
using Application.TextureSets;
using Application.Thumbnails;
using Domain.ValueObjects;
using SharedKernel;

namespace Application.StoreImports;

/// <summary>
/// Default <see cref="IStoreImportSink"/>: pure delegation to the existing command handlers,
/// no persistence logic of its own. Store texture sets import as ModelSpecific
/// (Multi-Model Textures) to match the CLI/endpoint default; sound duration defaults to 0 and
/// sprites to <see cref="SpriteType.Static"/>, both matching the with-file endpoints.
/// </summary>
internal sealed class StoreImportSink : IStoreImportSink
{
    private readonly ICommandHandler<CreatePackCommand, CreatePackResponse> _createPack;
    private readonly ICommandHandler<SetPackStoreProvenanceCommand> _setProvenance;
    private readonly ICommandHandler<SetPackCustomThumbnailCommand> _setPackThumbnail;
    private readonly ICommandHandler<AddModelCommand, AddModelCommandResponse> _addModel;
    private readonly ICommandHandler<AddFileToModelCommand, AddFileToModelCommandResponse> _addFileToModel;
    private readonly ICommandHandler<UpdateModelTagsCommand, UpdateModelTagsResponse> _updateModelTags;
    private readonly ICommandHandler<AddModelToPackCommand> _addModelToPack;
    private readonly ICommandHandler<UploadThumbnailCommand, UploadThumbnailCommandResponse> _uploadThumbnail;
    private readonly IQueryHandler<GetModelByIdQuery, GetModelByIdQueryResponse> _getModel;
    private readonly ICommandHandler<CreateTextureSetWithFileCommand, CreateTextureSetWithFileResponse> _createTextureSet;
    private readonly ICommandHandler<UploadFileCommand, UploadFileCommandResponse> _uploadFile;
    private readonly ICommandHandler<AddTextureToTextureSetCommand, AddTextureToTextureSetResponse> _addTexture;
    private readonly ICommandHandler<UpdateTextureSetTagsCommand, UpdateTextureSetTagsResponse> _updateTextureSetTags;
    private readonly ICommandHandler<AddTextureSetToPackCommand> _addTextureSetToPack;
    private readonly ICommandHandler<CreateSoundWithFileCommand, CreateSoundWithFileResponse> _createSound;
    private readonly ICommandHandler<AddSoundToPackCommand> _addSoundToPack;
    private readonly ICommandHandler<CreateSpriteWithFileCommand, CreateSpriteWithFileResponse> _createSprite;
    private readonly ICommandHandler<AddSpriteToPackCommand> _addSpriteToPack;
    private readonly ICommandHandler<CreateEnvironmentMapWithFileCommand, CreateEnvironmentMapWithFileResponse> _createEnvironmentMap;
    private readonly ICommandHandler<AddEnvironmentMapToPackCommand> _addEnvironmentMapToPack;

    public StoreImportSink(
        ICommandHandler<CreatePackCommand, CreatePackResponse> createPack,
        ICommandHandler<SetPackStoreProvenanceCommand> setProvenance,
        ICommandHandler<SetPackCustomThumbnailCommand> setPackThumbnail,
        ICommandHandler<AddModelCommand, AddModelCommandResponse> addModel,
        ICommandHandler<AddFileToModelCommand, AddFileToModelCommandResponse> addFileToModel,
        ICommandHandler<UpdateModelTagsCommand, UpdateModelTagsResponse> updateModelTags,
        ICommandHandler<AddModelToPackCommand> addModelToPack,
        ICommandHandler<UploadThumbnailCommand, UploadThumbnailCommandResponse> uploadThumbnail,
        IQueryHandler<GetModelByIdQuery, GetModelByIdQueryResponse> getModel,
        ICommandHandler<CreateTextureSetWithFileCommand, CreateTextureSetWithFileResponse> createTextureSet,
        ICommandHandler<UploadFileCommand, UploadFileCommandResponse> uploadFile,
        ICommandHandler<AddTextureToTextureSetCommand, AddTextureToTextureSetResponse> addTexture,
        ICommandHandler<UpdateTextureSetTagsCommand, UpdateTextureSetTagsResponse> updateTextureSetTags,
        ICommandHandler<AddTextureSetToPackCommand> addTextureSetToPack,
        ICommandHandler<CreateSoundWithFileCommand, CreateSoundWithFileResponse> createSound,
        ICommandHandler<AddSoundToPackCommand> addSoundToPack,
        ICommandHandler<CreateSpriteWithFileCommand, CreateSpriteWithFileResponse> createSprite,
        ICommandHandler<AddSpriteToPackCommand> addSpriteToPack,
        ICommandHandler<CreateEnvironmentMapWithFileCommand, CreateEnvironmentMapWithFileResponse> createEnvironmentMap,
        ICommandHandler<AddEnvironmentMapToPackCommand> addEnvironmentMapToPack)
    {
        _createPack = createPack;
        _setProvenance = setProvenance;
        _setPackThumbnail = setPackThumbnail;
        _addModel = addModel;
        _addFileToModel = addFileToModel;
        _updateModelTags = updateModelTags;
        _addModelToPack = addModelToPack;
        _uploadThumbnail = uploadThumbnail;
        _getModel = getModel;
        _createTextureSet = createTextureSet;
        _uploadFile = uploadFile;
        _addTexture = addTexture;
        _updateTextureSetTags = updateTextureSetTags;
        _addTextureSetToPack = addTextureSetToPack;
        _createSound = createSound;
        _addSoundToPack = addSoundToPack;
        _createSprite = createSprite;
        _addSpriteToPack = addSpriteToPack;
        _createEnvironmentMap = createEnvironmentMap;
        _addEnvironmentMapToPack = addEnvironmentMapToPack;
    }

    public async Task<int> CreatePackAsync(string name, string? description, string? licenseType, string? url, CancellationToken ct)
        => Unwrap(await _createPack.Handle(new CreatePackCommand(name, description, licenseType, url), ct)).Id;

    public Task RecordPackProvenanceAsync(int packId, string storeUrl, string storeAssetId, int manifestVersion, CancellationToken ct)
        => RunAsync(_setProvenance.Handle(new SetPackStoreProvenanceCommand(packId, storeUrl, storeAssetId, manifestVersion), ct));

    public async Task SetPackThumbnailFromFileAsync(int packId, IFileUpload file, CancellationToken ct)
    {
        var fileId = Unwrap(await _uploadFile.Handle(new UploadFileCommand(file, UploadType: "file"), ct)).FileId;
        await RunAsync(_setPackThumbnail.Handle(new SetPackCustomThumbnailCommand(packId, fileId), ct));
    }

    public async Task<int> CreateModelAsync(IFileUpload primaryFile, string name, string? batchId, bool generateThumbnail, CancellationToken ct)
        => Unwrap(await _addModel.Handle(new AddModelCommand(primaryFile, name, batchId, generateThumbnail), ct)).Id;

    public Task AddFileToModelAsync(int modelId, IFileUpload file, CancellationToken ct)
        => RunAsync<AddFileToModelCommandResponse>(_addFileToModel.Handle(new AddFileToModelCommand(modelId, file), ct));

    public async Task SetModelThumbnailFromFileAsync(int modelId, IFileUpload thumbnailFile, CancellationToken ct)
    {
        // Resolve the active version the same way ThumbnailEndpoints does — a freshly imported
        // model has exactly one (active) version to carry the thumbnail.
        var model = Unwrap(await _getModel.Handle(new GetModelByIdQuery(modelId), ct)).Model;
        if (model.ActiveVersionId is not int versionId)
            throw new StoreImportException($"Model {modelId} has no active version to attach a thumbnail to.");

        await RunAsync<UploadThumbnailCommandResponse>(
            _uploadThumbnail.Handle(new UploadThumbnailCommand(modelId, versionId, thumbnailFile), ct));
    }

    public Task SetModelTagsAsync(int modelId, IReadOnlyCollection<string> tags, string description, CancellationToken ct)
        => RunAsync<UpdateModelTagsResponse>(_updateModelTags.Handle(new UpdateModelTagsCommand(modelId, tags, description, null), ct));

    public Task AddModelToPackAsync(int packId, int modelId, CancellationToken ct)
        => RunAsync(_addModelToPack.Handle(new AddModelToPackCommand(packId, modelId), ct));

    public async Task<int> CreateTextureSetAsync(IFileUpload firstFile, string name, TextureType textureType, string? batchId, CancellationToken ct)
        => Unwrap(await _createTextureSet.Handle(
            new CreateTextureSetWithFileCommand(firstFile, name, textureType, BatchId: batchId, Kind: TextureSetKind.ModelSpecific), ct)).TextureSetId;

    public async Task<int> UploadTextureFileAsync(int textureSetId, IFileUpload file, CancellationToken ct)
        => Unwrap(await _uploadFile.Handle(new UploadFileCommand(file, UploadType: "texture", TextureSetId: textureSetId), ct)).FileId;

    public Task AddTextureAsync(int textureSetId, int fileId, TextureType textureType, TextureChannel? sourceChannel, CancellationToken ct)
        => RunAsync<AddTextureToTextureSetResponse>(_addTexture.Handle(
            new AddTextureToTextureSetCommand(textureSetId, fileId, textureType, sourceChannel), ct));

    public Task SetTextureSetTagsAsync(int textureSetId, IReadOnlyCollection<string> tags, CancellationToken ct)
        => RunAsync<UpdateTextureSetTagsResponse>(_updateTextureSetTags.Handle(new UpdateTextureSetTagsCommand(textureSetId, tags), ct));

    public Task AddTextureSetToPackAsync(int packId, int textureSetId, CancellationToken ct)
        => RunAsync(_addTextureSetToPack.Handle(new AddTextureSetToPackCommand(packId, textureSetId), ct));

    public async Task<int> CreateSoundAsync(IFileUpload file, string name, string? batchId, CancellationToken ct)
        => Unwrap(await _createSound.Handle(
            new CreateSoundWithFileCommand(file, name, Duration: 0, Peaks: null, CategoryId: null, BatchId: batchId, PackId: null, ProjectId: null), ct)).SoundId;

    public Task AddSoundToPackAsync(int packId, int soundId, CancellationToken ct)
        => RunAsync(_addSoundToPack.Handle(new AddSoundToPackCommand(packId, soundId), ct));

    public async Task<int> CreateSpriteAsync(IFileUpload file, string name, string? batchId, CancellationToken ct)
        => Unwrap(await _createSprite.Handle(
            new CreateSpriteWithFileCommand(file, name, SpriteType.Static, CategoryId: null, BatchId: batchId, PackId: null, ProjectId: null), ct)).SpriteId;

    public Task AddSpriteToPackAsync(int packId, int spriteId, CancellationToken ct)
        => RunAsync(_addSpriteToPack.Handle(new AddSpriteToPackCommand(packId, spriteId), ct));

    public async Task<int> CreateEnvironmentMapAsync(IFileUpload file, string name, string? batchId, CancellationToken ct)
        => Unwrap(await _createEnvironmentMap.Handle(
            new CreateEnvironmentMapWithFileCommand(file, CubeFaces: null, Name: name, SizeLabel: null, BatchId: batchId, PackId: null, ProjectId: null), ct)).EnvironmentMapId;

    public Task AddEnvironmentMapToPackAsync(int packId, int environmentMapId, CancellationToken ct)
        => RunAsync(_addEnvironmentMapToPack.Handle(new AddEnvironmentMapToPackCommand(packId, environmentMapId), ct));

    private static T Unwrap<T>(Result<T> result)
    {
        if (result.IsFailure)
            throw StoreImportException.FromError(result.Error.Code, result.Error.Message);
        return result.Value;
    }

    private static async Task RunAsync(Task<Result> resultTask)
    {
        var result = await resultTask;
        if (result.IsFailure)
            throw StoreImportException.FromError(result.Error.Code, result.Error.Message);
    }

    private static async Task RunAsync<T>(Task<Result<T>> resultTask)
        => Unwrap(await resultTask);
}
