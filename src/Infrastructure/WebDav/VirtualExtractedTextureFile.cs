using Application.Abstractions.Storage;
using Domain.ValueObjects;
using Microsoft.Extensions.Logging;
using NWebDav.Server;
using NWebDav.Server.Http;
using NWebDav.Server.Locking;
using NWebDav.Server.Props;
using NWebDav.Server.Stores;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;
using SixLabors.ImageSharp.Processing;

namespace Infrastructure.WebDav;

/// <summary>
/// Represents a virtual asset file that is a specific channel extracted from a source image.
/// </summary>
public sealed class VirtualExtractedTextureFile : IStoreItem, IVirtualFileMetadata
{
    private readonly IUploadPathProvider _pathProvider;
    private readonly string _relativePath;
    private readonly TextureChannel _channel;
    private readonly ILogger<VirtualExtractedTextureFile> _logger;

    /// <param name="relativePath">
    /// The source <c>File.FilePath</c> persisted by <c>HashBasedFileStorage</c> — single
    /// source of truth for the physical layout; see item 4 of prompt 30.
    /// </param>
    public VirtualExtractedTextureFile(
        VirtualItemPropertyManager propertyManager,
        ILockingManager lockingManager,
        string name,
        string sourceSha256Hash,
        string relativePath,
        long sourceSizeBytes,
        DateTime createdAt,
        DateTime updatedAt,
        IUploadPathProvider pathProvider,
        TextureChannel channel,
        ILogger<VirtualExtractedTextureFile> logger)
    {
        PropertyManager = propertyManager;
        LockingManager = lockingManager;
        Name = name;
        Sha256Hash = sourceSha256Hash;
        // We report source size as an approximation for PROPFIND.
        // Actual stream length will differ.
        SizeBytes = sourceSizeBytes;
        MimeType = "image/png"; // Extracted channels are always served as PNG
        CreatedAt = createdAt;
        UpdatedAt = updatedAt;
        _pathProvider = pathProvider;
        _relativePath = relativePath;
        _channel = channel;
        _logger = logger;
    }

    public string Name { get; }
    public string UniqueKey => $"asset:{Sha256Hash}:channel:{_channel}";
    public string Sha256Hash { get; }
    public long SizeBytes { get; }
    public string MimeType { get; }
    public DateTime CreatedAt { get; }
    public DateTime UpdatedAt { get; }
    public IPropertyManager PropertyManager { get; }
    public ILockingManager LockingManager { get; }

    public async Task<Stream> GetReadableStreamAsync(IHttpContext httpContext)
    {
        var physicalPath = GetPhysicalPath();

        if (!File.Exists(physicalPath))
        {
            // See VirtualAssetFile.GetReadableStreamAsync for why Stream.Null is the
            // right return here: CustomWebDavHandler treats it as a 404, never as an
            // empty 200 body.
            _logger.LogError(
                "Missing physical source blob for extracted texture {Name} channel {Channel} (hash {Hash}): expected at {ExpectedPath}",
                Name, _channel, Sha256Hash, physicalPath);
            return Stream.Null;
        }

        try
        {
            // Load source image
            using var image = await Image.LoadAsync<Rgba32>(physicalPath);
            
            // Create grayscale image for the result
            using var result = new Image<L8>(image.Width, image.Height);
            
            // Extract the specific channel
            image.ProcessPixelRows(result, (sourceAccessor, targetAccessor) => {
                for (int y = 0; y < sourceAccessor.Height; y++)
                {
                    var sourceRow = sourceAccessor.GetRowSpan(y);
                    var targetRow = targetAccessor.GetRowSpan(y);
                    
                    for (int x = 0; x < sourceRow.Length; x++)
                    {
                        byte val = 0;
                        switch (_channel)
                        {
                            case TextureChannel.R: val = sourceRow[x].R; break;
                            case TextureChannel.G: val = sourceRow[x].G; break;
                            case TextureChannel.B: val = sourceRow[x].B; break;
                            case TextureChannel.A: val = sourceRow[x].A; break;
                        }
                        targetRow[x] = new L8(val);
                    }
                }
            });

            var ms = new MemoryStream();
            await result.SaveAsPngAsync(ms);
            ms.Position = 0;
            return ms;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error extracting channel {Channel} from {Name}", _channel, Name);
            return Stream.Null;
        }
    }

    public Task<DavStatusCode> UploadFromStreamAsync(IHttpContext httpContext, Stream source)
    {
        // Read-only
        return Task.FromResult(DavStatusCode.Forbidden);
    }

    public Task<StoreItemResult> CopyAsync(IStoreCollection destination, string name, bool overwrite, IHttpContext httpContext)
    {
        // Read-only
        return Task.FromResult(new StoreItemResult(DavStatusCode.Forbidden));
    }

    private string GetPhysicalPath() => Path.Combine(_pathProvider.UploadRootPath, _relativePath);
}
