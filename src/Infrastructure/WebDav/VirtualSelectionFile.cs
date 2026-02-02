using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Application.Abstractions.Storage;
using Microsoft.Extensions.DependencyInjection;
using NWebDav.Server;
using NWebDav.Server.Http;
using NWebDav.Server.Locking;
using NWebDav.Server.Props;
using NWebDav.Server.Stores;

namespace Infrastructure.WebDav;

/// <summary>
/// Virtual file that represents a trimmed audio snippet based on the current selection.
/// The file is named {SoundName}Selection.wav and streams trimmed audio from the source file.
/// </summary>
public sealed class VirtualAudioSelectionFile : IStoreItem
{
    private readonly IAudioSelectionService _selectionService;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IUploadPathProvider _pathProvider;

    public VirtualAudioSelectionFile(
        VirtualItemPropertyManager propertyManager,
        ILockingManager lockingManager,
        IAudioSelectionService selectionService,
        IServiceScopeFactory scopeFactory,
        IUploadPathProvider pathProvider)
    {
        PropertyManager = propertyManager;
        LockingManager = lockingManager;
        _selectionService = selectionService;
        _scopeFactory = scopeFactory;
        _pathProvider = pathProvider;
    }

    public string Name
    {
        get
        {
            var selection = _selectionService.GetSelection();
            if (selection == null)
                return "NoSelection.wav";
            
            var baseName = Path.GetFileNameWithoutExtension(selection.FileName);
            return $"{baseName}Selection.wav";
        }
    }

    public string UniqueKey => "audio:selection";
    public IPropertyManager PropertyManager { get; }
    public ILockingManager LockingManager { get; }

    /// <summary>
    /// Returns the trimmed audio stream for the current selection.
    /// Note: Full WAV trimming would require audio processing libraries.
    /// This implementation returns the full file - a proper implementation would use NAudio or similar.
    /// </summary>
    public async Task<Stream> GetReadableStreamAsync(IHttpContext httpContext)
    {
        var selection = _selectionService.GetSelection();
        if (selection == null)
        {
            return Stream.Null;
        }

        // Get the file from the repository
        using var scope = _scopeFactory.CreateScope();
        var fileRepository = scope.ServiceProvider.GetRequiredService<IFileRepository>();
        
        var file = await fileRepository.GetByIdAsync(selection.FileId);
        if (file == null)
        {
            return Stream.Null;
        }

        var physicalPath = GetPhysicalPath(file.Sha256Hash);
        if (!File.Exists(physicalPath))
        {
            return Stream.Null;
        }

        // For a full implementation, we would use an audio processing library here
        // to trim the audio file between selection.StartTime and selection.EndTime.
        // For now, we return the full file as a placeholder.
        // 
        // To properly implement audio trimming, consider using:
        // - NAudio (https://github.com/naudio/NAudio)
        // - FFmpeg via FFMpegCore
        // - A custom WAV header manipulation for simple WAV files
        
        return File.OpenRead(physicalPath);
    }

    public Task<DavStatusCode> UploadFromStreamAsync(IHttpContext httpContext, Stream source)
    {
        return Task.FromResult(DavStatusCode.Forbidden);
    }

    public Task<StoreItemResult> CopyAsync(IStoreCollection destination, string name, bool overwrite, IHttpContext httpContext)
    {
        return Task.FromResult(new StoreItemResult(DavStatusCode.Forbidden));
    }

    private string GetPhysicalPath(string sha256Hash)
    {
        var hash = sha256Hash.ToLowerInvariant();
        var a = hash[..2];
        var b = hash[2..4];
        return Path.Combine(_pathProvider.UploadRootPath, a, b, hash);
    }
}

/// <summary>
/// Virtual collection for the Selection folder that exposes the current audio selection.
/// </summary>
public sealed class VirtualSelectionCollection : VirtualCollectionBase
{
    private readonly IAudioSelectionService _selectionService;
    private readonly VirtualItemPropertyManager _itemPropertyManager;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IUploadPathProvider _pathProvider;

    public VirtualSelectionCollection(
        VirtualCollectionPropertyManager propertyManager,
        ILockingManager lockingManager,
        IAudioSelectionService selectionService,
        VirtualItemPropertyManager itemPropertyManager,
        IServiceScopeFactory scopeFactory,
        IUploadPathProvider pathProvider)
        : base(propertyManager, lockingManager, "Selection")
    {
        _selectionService = selectionService;
        _itemPropertyManager = itemPropertyManager;
        _scopeFactory = scopeFactory;
        _pathProvider = pathProvider;
    }

    public override string UniqueKey => "selection";

    public override Task<IStoreItem?> GetItemAsync(string name, IHttpContext httpContext)
    {
        var selection = _selectionService.GetSelection();
        if (selection == null)
            return Task.FromResult<IStoreItem?>(null);

        // Check if the requested file matches the selection pattern
        var expectedName = $"{Path.GetFileNameWithoutExtension(selection.FileName)}Selection.wav";
        if (!string.Equals(name, expectedName, StringComparison.OrdinalIgnoreCase))
            return Task.FromResult<IStoreItem?>(null);

        return Task.FromResult<IStoreItem?>(new VirtualAudioSelectionFile(
            _itemPropertyManager,
            LockingManager,
            _selectionService,
            _scopeFactory,
            _pathProvider));
    }

    public override Task<IEnumerable<IStoreItem>> GetItemsAsync(IHttpContext httpContext)
    {
        var selection = _selectionService.GetSelection();
        if (selection == null)
            return Task.FromResult<IEnumerable<IStoreItem>>(Array.Empty<IStoreItem>());

        var items = new List<IStoreItem>
        {
            new VirtualAudioSelectionFile(
                _itemPropertyManager,
                LockingManager,
                _selectionService,
                _scopeFactory,
                _pathProvider)
        };

        return Task.FromResult<IEnumerable<IStoreItem>>(items);
    }
}
