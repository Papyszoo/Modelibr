using Application.Abstractions.Files;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Abstractions.Storage;
using Application.Sprites;
using Application.Sounds;
using Domain.Models;
using Domain.Services;
using Domain.ValueObjects;
using Microsoft.Extensions.DependencyInjection;
using NWebDav.Server;
using NWebDav.Server.Http;
using NWebDav.Server.Locking;
using NWebDav.Server.Stores;

namespace Infrastructure.WebDav;

/// <summary>
/// Writable collection for project sprites that supports file upload via WebDAV PUT.
/// </summary>
public sealed class WritableProjectSpritesCollection : VirtualCollectionBase
{
    private readonly Project _project;
    private readonly VirtualItemPropertyManager _itemPropertyManager;
    private readonly IUploadPathProvider _pathProvider;
    private readonly IServiceScopeFactory _scopeFactory;

    public WritableProjectSpritesCollection(
        VirtualCollectionPropertyManager propertyManager,
        ILockingManager lockingManager,
        Project project,
        VirtualItemPropertyManager itemPropertyManager,
        IUploadPathProvider pathProvider,
        IServiceScopeFactory scopeFactory)
        : base(propertyManager, lockingManager, "Sprites")
    {
        _project = project;
        _itemPropertyManager = itemPropertyManager;
        _pathProvider = pathProvider;
        _scopeFactory = scopeFactory;
    }

    public override string UniqueKey => $"project:{_project.Id}:sprites:writable";

    public override Task<IStoreItem?> GetItemAsync(string name, IHttpContext httpContext)
    {
        var sprite = _project.Sprites.FirstOrDefault(s => !s.IsDeleted && s.File.OriginalFileName == name);
        if (sprite == null)
            return Task.FromResult<IStoreItem?>(null);

        return Task.FromResult<IStoreItem?>(new VirtualAssetFile(
            _itemPropertyManager,
            LockingManager,
            sprite.File.OriginalFileName,
            sprite.File.Sha256Hash,
            sprite.File.SizeBytes,
            sprite.File.MimeType,
            sprite.File.CreatedAt,
            sprite.File.UpdatedAt,
            _pathProvider));
    }

    public override Task<IEnumerable<IStoreItem>> GetItemsAsync(IHttpContext httpContext)
    {
        var items = _project.Sprites
            .Where(s => !s.IsDeleted)
            .Select(s => (IStoreItem)new VirtualAssetFile(
                _itemPropertyManager,
                LockingManager,
                s.File.OriginalFileName,
                s.File.Sha256Hash,
                s.File.SizeBytes,
                s.File.MimeType,
                s.File.CreatedAt,
                s.File.UpdatedAt,
                _pathProvider));

        return Task.FromResult(items);
    }

    /// <summary>
    /// Creates a new sprite from an uploaded file.
    /// </summary>
    public new async Task<StoreItemResult> CreateItemAsync(string name, bool overwrite, IHttpContext httpContext)
    {
        using var scope = _scopeFactory.CreateScope();
        var sp = scope.ServiceProvider;

        // Get the request body stream
        var request = httpContext.Request;
        var stream = request.Stream;
        
        if (stream == null || !stream.CanRead)
        {
            return new StoreItemResult(DavStatusCode.BadRequest);
        }

        try
        {
            // Read the file content
            using var memoryStream = new MemoryStream();
            await stream.CopyToAsync(memoryStream);
            memoryStream.Position = 0;
            
            var content = memoryStream.ToArray();
            if (content.Length == 0)
            {
                return new StoreItemResult(DavStatusCode.BadRequest);
            }

            // Create a file upload wrapper
            var fileUpload = new StreamFileUpload(name, content, GetMimeType(name));

            // Use the command handler to create the sprite
            var commandHandler = sp.GetRequiredService<ICommandHandler<CreateSpriteWithFileCommand, CreateSpriteWithFileResponse>>();
            
            var result = await commandHandler.Handle(
                new CreateSpriteWithFileCommand(
                    fileUpload,
                    Path.GetFileNameWithoutExtension(name),
                    SpriteType.Static,
                    null, // categoryId
                    null, // batchId
                    null, // packId
                    _project.Id), // projectId
                CancellationToken.None);

            if (!result.IsSuccess)
            {
                return new StoreItemResult(DavStatusCode.InternalServerError);
            }

            // Return success - the file was created
            // Note: We return Created for new items
            return new StoreItemResult(DavStatusCode.Created);
        }
        catch (Exception)
        {
            return new StoreItemResult(DavStatusCode.InternalServerError);
        }
    }

    private static string GetMimeType(string fileName)
    {
        var extension = Path.GetExtension(fileName).ToLowerInvariant();
        return extension switch
        {
            ".png" => "image/png",
            ".jpg" or ".jpeg" => "image/jpeg",
            ".gif" => "image/gif",
            ".webp" => "image/webp",
            ".svg" => "image/svg+xml",
            ".bmp" => "image/bmp",
            _ => "application/octet-stream"
        };
    }
}

/// <summary>
/// Writable collection for project sounds that supports file upload via WebDAV PUT.
/// </summary>
public sealed class WritableProjectSoundsCollection : VirtualCollectionBase
{
    private readonly Project _project;
    private readonly VirtualItemPropertyManager _itemPropertyManager;
    private readonly IUploadPathProvider _pathProvider;
    private readonly IServiceScopeFactory _scopeFactory;

    public WritableProjectSoundsCollection(
        VirtualCollectionPropertyManager propertyManager,
        ILockingManager lockingManager,
        Project project,
        VirtualItemPropertyManager itemPropertyManager,
        IUploadPathProvider pathProvider,
        IServiceScopeFactory scopeFactory)
        : base(propertyManager, lockingManager, "Sounds")
    {
        _project = project;
        _itemPropertyManager = itemPropertyManager;
        _pathProvider = pathProvider;
        _scopeFactory = scopeFactory;
    }

    public override string UniqueKey => $"project:{_project.Id}:sounds:writable";

    public override Task<IStoreItem?> GetItemAsync(string name, IHttpContext httpContext)
    {
        var sound = _project.Sounds.FirstOrDefault(s => !s.IsDeleted && s.File.OriginalFileName == name);
        if (sound == null)
            return Task.FromResult<IStoreItem?>(null);

        return Task.FromResult<IStoreItem?>(new VirtualAssetFile(
            _itemPropertyManager,
            LockingManager,
            sound.File.OriginalFileName,
            sound.File.Sha256Hash,
            sound.File.SizeBytes,
            sound.File.MimeType,
            sound.File.CreatedAt,
            sound.File.UpdatedAt,
            _pathProvider));
    }

    public override Task<IEnumerable<IStoreItem>> GetItemsAsync(IHttpContext httpContext)
    {
        var items = _project.Sounds
            .Where(s => !s.IsDeleted)
            .Select(s => (IStoreItem)new VirtualAssetFile(
                _itemPropertyManager,
                LockingManager,
                s.File.OriginalFileName,
                s.File.Sha256Hash,
                s.File.SizeBytes,
                s.File.MimeType,
                s.File.CreatedAt,
                s.File.UpdatedAt,
                _pathProvider));

        return Task.FromResult(items);
    }

    /// <summary>
    /// Creates a new sound from an uploaded file.
    /// </summary>
    public new async Task<StoreItemResult> CreateItemAsync(string name, bool overwrite, IHttpContext httpContext)
    {
        using var scope = _scopeFactory.CreateScope();
        var sp = scope.ServiceProvider;

        var request = httpContext.Request;
        var stream = request.Stream;
        
        if (stream == null || !stream.CanRead)
        {
            return new StoreItemResult(DavStatusCode.BadRequest);
        }

        try
        {
            using var memoryStream = new MemoryStream();
            await stream.CopyToAsync(memoryStream);
            memoryStream.Position = 0;
            
            var content = memoryStream.ToArray();
            if (content.Length == 0)
            {
                return new StoreItemResult(DavStatusCode.BadRequest);
            }

            var fileUpload = new StreamFileUpload(name, content, GetMimeType(name));

            var commandHandler = sp.GetRequiredService<ICommandHandler<CreateSoundWithFileCommand, CreateSoundWithFileResponse>>();
            
            var result = await commandHandler.Handle(
                new CreateSoundWithFileCommand(
                    fileUpload,
                    Path.GetFileNameWithoutExtension(name),
                    0.0, // duration - will be computed later if needed
                    null, // peaks
                    null, // categoryId
                    null, // batchId
                    null, // packId
                    _project.Id), // projectId
                CancellationToken.None);

            if (!result.IsSuccess)
            {
                return new StoreItemResult(DavStatusCode.InternalServerError);
            }

            return new StoreItemResult(DavStatusCode.Created);
        }
        catch (Exception)
        {
            return new StoreItemResult(DavStatusCode.InternalServerError);
        }
    }

    private static string GetMimeType(string fileName)
    {
        var extension = Path.GetExtension(fileName).ToLowerInvariant();
        return extension switch
        {
            ".mp3" => "audio/mpeg",
            ".wav" => "audio/wav",
            ".ogg" => "audio/ogg",
            ".flac" => "audio/flac",
            ".aac" => "audio/aac",
            ".m4a" => "audio/mp4",
            _ => "application/octet-stream"
        };
    }
}

/// <summary>
/// Simple file upload wrapper for streaming file content.
/// </summary>
internal sealed class StreamFileUpload : IFileUpload
{
    private readonly byte[] _content;

    public StreamFileUpload(string fileName, byte[] content, string contentType)
    {
        FileName = fileName;
        _content = content;
        ContentType = contentType;
    }

    public string FileName { get; }
    public string ContentType { get; }
    public long Length => _content.Length;

    public Stream OpenRead()
    {
        return new MemoryStream(_content);
    }

    public Task CopyToAsync(Stream target, CancellationToken cancellationToken = default)
    {
        return target.WriteAsync(_content, 0, _content.Length, cancellationToken);
    }
}
