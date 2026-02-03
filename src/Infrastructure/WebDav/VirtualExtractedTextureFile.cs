using Application.Abstractions.Storage;
using Domain.ValueObjects;
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
public sealed class VirtualExtractedTextureFile : IStoreItem
{
    private readonly IUploadPathProvider _pathProvider;
    private readonly TextureChannel _channel;

    public VirtualExtractedTextureFile(
        VirtualItemPropertyManager propertyManager,
        ILockingManager lockingManager,
        string name,
        string sourceSha256Hash,
        long sourceSizeBytes,
        DateTime createdAt,
        DateTime updatedAt,
        IUploadPathProvider pathProvider,
        TextureChannel channel)
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
        _channel = channel;
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
            Console.WriteLine($"[VirtualExtractedTextureFile] Error extracting channel {_channel} from {Name}: {ex}");
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

    private string GetPhysicalPath()
    {
        // Hash-based storage: root/aa/bb/hash
        var hash = Sha256Hash.ToLowerInvariant();
        if (hash.Length < 4) return string.Empty;
        
        var a = hash[..2];
        var b = hash[2..4];
        return Path.Combine(_pathProvider.UploadRootPath, a, b, hash);
    }
}
