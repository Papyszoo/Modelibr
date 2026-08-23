using System.Text.Json;
using Application.Abstractions.Files;
using Application.Abstractions.Messaging;
using Application.EnvironmentMaps;
using Application.Files;
using Application.Metadata;
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
    private readonly ICommandHandler<UpdateEnvironmentMapMetadataCommand, UpdateEnvironmentMapMetadataResponse> _updateEnvironmentMapMetadata;
    private readonly ICommandHandler<AddEnvironmentMapToPackCommand> _addEnvironmentMapToPack;
    private readonly ICommandHandler<UpdateSoundCommand, UpdateSoundResponse> _updateSound;
    private readonly ICommandHandler<UpdateSpriteCommand, UpdateSpriteResponse> _updateSprite;
    private readonly ICommandHandler<UpdateTextureSetCommand, UpdateTextureSetResponse> _updateTextureSet;
    private readonly IQueryHandler<GetEnvironmentMapByIdQuery, GetEnvironmentMapByIdResponse> _getEnvironmentMap;
    private readonly ICommandHandler<UpdateSoundMetadataCommand, UpdateSoundMetadataResponse> _updateSoundMetadata;
    private readonly ICommandHandler<UpdateSpriteMetadataCommand, UpdateSpriteMetadataResponse> _updateSpriteMetadata;
    private readonly IQueryHandler<ReadAssetMetadataQuery, AssetMetadataResponse> _readAssetMetadata;
    private readonly ICommandHandler<SetAssetMetadataCommand, AssetMetadataResponse> _setAssetMetadata;

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
        ICommandHandler<UpdateEnvironmentMapMetadataCommand, UpdateEnvironmentMapMetadataResponse> updateEnvironmentMapMetadata,
        ICommandHandler<AddEnvironmentMapToPackCommand> addEnvironmentMapToPack,
        ICommandHandler<UpdateSoundCommand, UpdateSoundResponse> updateSound,
        ICommandHandler<UpdateSpriteCommand, UpdateSpriteResponse> updateSprite,
        ICommandHandler<UpdateTextureSetCommand, UpdateTextureSetResponse> updateTextureSet,
        IQueryHandler<GetEnvironmentMapByIdQuery, GetEnvironmentMapByIdResponse> getEnvironmentMap,
        ICommandHandler<UpdateSoundMetadataCommand, UpdateSoundMetadataResponse> updateSoundMetadata,
        ICommandHandler<UpdateSpriteMetadataCommand, UpdateSpriteMetadataResponse> updateSpriteMetadata,
        IQueryHandler<ReadAssetMetadataQuery, AssetMetadataResponse> readAssetMetadata,
        ICommandHandler<SetAssetMetadataCommand, AssetMetadataResponse> setAssetMetadata)
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
        _updateEnvironmentMapMetadata = updateEnvironmentMapMetadata;
        _addEnvironmentMapToPack = addEnvironmentMapToPack;
        _updateSound = updateSound;
        _updateSprite = updateSprite;
        _updateTextureSet = updateTextureSet;
        _getEnvironmentMap = getEnvironmentMap;
        _updateSoundMetadata = updateSoundMetadata;
        _updateSpriteMetadata = updateSpriteMetadata;
        _readAssetMetadata = readAssetMetadata;
        _setAssetMetadata = setAssetMetadata;
    }

    public async Task<int> CreatePackAsync(
        string name, string? description, string? licenseType, string? url,
        string storeUrl, string storeAssetId, int manifestVersion, CancellationToken ct)
        => Unwrap(await _createPack.Handle(
            new CreatePackCommand(
                name, description, licenseType, url,
                new PackStoreProvenance(storeUrl, storeAssetId, manifestVersion)),
            ct)).Id;

    public Task RecordPackProvenanceAsync(int packId, string storeUrl, string storeAssetId, int manifestVersion, CancellationToken ct)
        => RunAsync(_setProvenance.Handle(new SetPackStoreProvenanceCommand(packId, storeUrl, storeAssetId, manifestVersion), ct));

    public async Task SetPackThumbnailFromFileAsync(int packId, IFileUpload file, CancellationToken ct)
    {
        var fileId = Unwrap(await _uploadFile.Handle(new UploadFileCommand(file, UploadType: "file"), ct)).FileId;
        await RunAsync(_setPackThumbnail.Handle(new SetPackCustomThumbnailCommand(packId, fileId), ct));
    }

    public async Task<int> CreateModelAsync(IFileUpload primaryFile, string name, string? batchId, bool generateThumbnail, CancellationToken ct)
        => Unwrap(await _addModel.Handle(
            new AddModelCommand(
                primaryFile, name, batchId,
                GenerateThumbnail: generateThumbnail,
                // The manifest already says what this is - category, tags, licence, author.
                // Guessing a category from the file name over that would be strictly worse.
                AutoAssignMetadata: false), ct)).Id;

    public Task AddFileToModelAsync(int modelId, IFileUpload file, CancellationToken ct)
        => RunAsync<AddFileToModelCommandResponse>(_addFileToModel.Handle(new AddFileToModelCommand(modelId, file), ct));

    public async Task SetModelThumbnailFromFileAsync(int modelId, IFileUpload thumbnailFile, CancellationToken ct)
    {
        // Resolve the active version the same way ThumbnailEndpoints does - a freshly imported
        // model has exactly one (active) version to carry the thumbnail.
        var model = Unwrap(await _getModel.Handle(new GetModelByIdQuery(modelId), ct)).Model;
        if (model.ActiveVersionId is not int versionId)
            throw new StoreImportException($"Model {modelId} has no active version to attach a thumbnail to.");

        await RunAsync<UploadThumbnailCommandResponse>(
            _uploadThumbnail.Handle(new UploadThumbnailCommand(modelId, versionId, thumbnailFile), ct));
    }

    public Task SetModelTagsAsync(int modelId, IReadOnlyCollection<string> tags, string description, int? categoryId, CancellationToken ct)
        => RunAsync<UpdateModelTagsResponse>(_updateModelTags.Handle(new UpdateModelTagsCommand(modelId, tags, description, categoryId), ct));

    public Task AddModelToPackAsync(int packId, int modelId, CancellationToken ct)
        => RunAsync(_addModelToPack.Handle(new AddModelToPackCommand(packId, modelId), ct));

    public async Task<int> CreateTextureSetAsync(IFileUpload firstFile, string name, TextureType textureType, string? batchId, int? categoryId, CancellationToken ct)
        => Unwrap(await _createTextureSet.Handle(
            new CreateTextureSetWithFileCommand(firstFile, name, textureType, BatchId: batchId, Kind: TextureSetKind.ModelSpecific, CategoryId: categoryId), ct)).TextureSetId;

    public async Task<int> UploadTextureFileAsync(int textureSetId, IFileUpload file, CancellationToken ct)
        => Unwrap(await _uploadFile.Handle(new UploadFileCommand(file, UploadType: "texture", TextureSetId: textureSetId), ct)).FileId;

    public Task AddTextureAsync(int textureSetId, int fileId, TextureType textureType, TextureChannel? sourceChannel, CancellationToken ct)
        => RunAsync<AddTextureToTextureSetResponse>(_addTexture.Handle(
            new AddTextureToTextureSetCommand(textureSetId, fileId, textureType, sourceChannel), ct));

    public Task SetTextureSetTagsAsync(int textureSetId, IReadOnlyCollection<string> tags, CancellationToken ct)
        => RunAsync<UpdateTextureSetTagsResponse>(_updateTextureSetTags.Handle(new UpdateTextureSetTagsCommand(textureSetId, tags), ct));

    public Task AddTextureSetToPackAsync(int packId, int textureSetId, CancellationToken ct)
        => RunAsync(_addTextureSetToPack.Handle(new AddTextureSetToPackCommand(packId, textureSetId), ct));

    public async Task<int> CreateSoundAsync(IFileUpload file, string name, string? batchId, int? categoryId, CancellationToken ct)
        => Unwrap(await _createSound.Handle(
            new CreateSoundWithFileCommand(file, name, Duration: 0, Peaks: null, CategoryId: categoryId, BatchId: batchId, PackId: null, ProjectId: null), ct)).SoundId;

    public Task AddSoundToPackAsync(int packId, int soundId, CancellationToken ct)
        => RunAsync(_addSoundToPack.Handle(new AddSoundToPackCommand(packId, soundId), ct));

    public async Task<int> CreateSpriteAsync(IFileUpload file, string name, string? batchId, int? categoryId, CancellationToken ct)
        => Unwrap(await _createSprite.Handle(
            new CreateSpriteWithFileCommand(file, name, SpriteType.Static, CategoryId: categoryId, BatchId: batchId, PackId: null, ProjectId: null), ct)).SpriteId;

    public Task AddSpriteToPackAsync(int packId, int spriteId, CancellationToken ct)
        => RunAsync(_addSpriteToPack.Handle(new AddSpriteToPackCommand(packId, spriteId), ct));

    public async Task<int> CreateEnvironmentMapAsync(IFileUpload file, string name, string? batchId, CancellationToken ct)
        => Unwrap(await _createEnvironmentMap.Handle(
            new CreateEnvironmentMapWithFileCommand(file, CubeFaces: null, Name: name, SizeLabel: null, BatchId: batchId, PackId: null, ProjectId: null), ct)).EnvironmentMapId;

    public Task AddEnvironmentMapToPackAsync(int packId, int environmentMapId, CancellationToken ct)
        => RunAsync(_addEnvironmentMapToPack.Handle(new AddEnvironmentMapToPackCommand(packId, environmentMapId), ct));

    // UpdateModelTags is the one command that assigns model categories, but it replaces
    // tags/description wholesale - so re-send the model's current ones to leave them intact.
    public async Task SetModelCategoryAsync(int modelId, int categoryId, CancellationToken ct)
    {
        var model = Unwrap(await _getModel.Handle(new GetModelByIdQuery(modelId), ct)).Model;
        await RunAsync<UpdateModelTagsResponse>(_updateModelTags.Handle(
            new UpdateModelTagsCommand(modelId, model.Tags, model.Description, categoryId), ct));
    }

    // UpdateTextureSet requires a name; passing the current one is a no-op rename.
    public Task SetTextureSetCategoryAsync(int textureSetId, string currentName, int categoryId, CancellationToken ct)
        => RunAsync<UpdateTextureSetResponse>(_updateTextureSet.Handle(
            new UpdateTextureSetCommand(textureSetId, currentName, categoryId), ct));

    public Task SetSoundCategoryAsync(int soundId, int categoryId, CancellationToken ct)
        => RunAsync<UpdateSoundResponse>(_updateSound.Handle(
            new UpdateSoundCommand(soundId, Name: null, CategoryId: categoryId), ct));

    public Task SetSpriteCategoryAsync(int spriteId, int categoryId, CancellationToken ct)
        => RunAsync<UpdateSpriteResponse>(_updateSprite.Handle(
            new UpdateSpriteCommand(spriteId, Name: null, SpriteType: null, CategoryId: categoryId), ct));

    // Like UpdateModelTags, the env-map metadata command replaces tags wholesale -
    // re-send the current ones so only the category changes.
    public async Task SetEnvironmentMapCategoryAsync(int environmentMapId, int categoryId, CancellationToken ct)
    {
        var envMap = Unwrap(await _getEnvironmentMap.Handle(new GetEnvironmentMapByIdQuery(environmentMapId), ct)).EnvironmentMap;
        await RunAsync<UpdateEnvironmentMapMetadataResponse>(_updateEnvironmentMapMetadata.Handle(
            new UpdateEnvironmentMapMetadataCommand(environmentMapId, envMap.Tags.ToList(), categoryId), ct));
    }

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

    public async Task StampAssetMetadataAsync(
        string assetType, int assetId, StoreAssetMetadataStamp stamp, CancellationToken ct)
    {
        var current = await _readAssetMetadata.Handle(new ReadAssetMetadataQuery(assetType, assetId), ct);
        var filled = current.IsSuccess
            ? current.Value.Fields.Where(f => f.Value is not null).Select(f => f.Key)
            : Enumerable.Empty<string>();

        var fields = StoreMetadataStampFields.Build(assetType, stamp, filled);
        if (fields.Count == 0)
        {
            return;
        }

        await _setAssetMetadata.Handle(new SetAssetMetadataCommand(assetType, assetId, fields), ct);
    }


    public Task SetSoundTagsAsync(
        int soundId, IReadOnlyCollection<string> tags, string? description, CancellationToken ct)
        => RunAsync(_updateSoundMetadata.Handle(new UpdateSoundMetadataCommand(soundId, tags, description), ct));

    public Task SetSpriteTagsAsync(
        int spriteId, IReadOnlyCollection<string> tags, string? description, CancellationToken ct)
        => RunAsync(_updateSpriteMetadata.Handle(new UpdateSpriteMetadataCommand(spriteId, tags, description), ct));

}
