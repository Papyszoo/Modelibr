using System;
using System.Globalization;
using System.IO;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Infrastructure.WebDav;
using Microsoft.Extensions.Logging;
using NWebDav.Server;
using NWebDav.Server.Http;
using NWebDav.Server.Stores;

namespace WebApi.Services;

/// <summary>
/// Handles WebDAV OPTIONS, GET and HEAD requests for the virtual asset drive.
/// PROPFIND is handled separately by <see cref="MacOsPropFindHandler"/> — see
/// <see cref="RequestHandlerFactory"/> — so it is intentionally not handled here.
/// </summary>
public class CustomWebDavHandler : IRequestHandler
{
    private readonly ILogger<CustomWebDavHandler> _logger;

    public CustomWebDavHandler(ILogger<CustomWebDavHandler> logger)
    {
        _logger = logger;
    }

    public async Task<bool> HandleRequestAsync(IHttpContext httpContext, IStore store)
    {
        var request = httpContext.Request;
        _logger.LogDebug("Handling {HttpMethod} {Url}", request.HttpMethod, request.Url);

        switch (request.HttpMethod.ToUpperInvariant())
        {
            case "OPTIONS":
                return HandleOptions(httpContext);
            case "GET":
            case "HEAD":
                return await HandleGetHeadAsync(httpContext, store).ConfigureAwait(false);
            default:
                // Unknown method — let the dispatcher fall through to a 404/501.
                return false;
        }
    }

    private static bool HandleOptions(IHttpContext httpContext)
    {
        var response = httpContext.Response;

        // Critical WebDAV compliance headers.
        response.SetHeaderValue("Dav", "1, 2");
        response.SetHeaderValue("MS-Author-Via", "DAV");
        response.SetHeaderValue("Allow", "OPTIONS, GET, HEAD, POST, PUT, DELETE, TRACE, COPY, MOVE, MKCOL, PROPFIND, PROPPATCH, LOCK, UNLOCK");
        response.SetHeaderValue("Public", "OPTIONS, GET, HEAD, POST, PUT, DELETE, TRACE, COPY, MOVE, MKCOL, PROPFIND, PROPPATCH, LOCK, UNLOCK");

        response.Status = 200;
        return true;
    }

    private async Task<bool> HandleGetHeadAsync(IHttpContext httpContext, IStore store)
    {
        var request = httpContext.Request;
        var response = httpContext.Response;
        var isHead = request.HttpMethod.Equals("HEAD", StringComparison.OrdinalIgnoreCase);

        try
        {
            var item = await store.GetItemAsync(request.Url, httpContext).ConfigureAwait(false);
            if (item == null)
            {
                response.Status = 404;
                return true;
            }

            if (item is IStoreCollection collection)
            {
                await WriteCollectionListingAsync(httpContext, collection, isHead).ConfigureAwait(false);
                return true;
            }

            await WriteFileAsync(httpContext, item, isHead).ConfigureAwait(false);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "{Method} request failed for {Url}", request.HttpMethod, request.Url);
            response.Status = 500;
            return true;
        }
    }

    /// <summary>Renders a simple HTML directory listing for a collection.</summary>
    private static async Task WriteCollectionListingAsync(IHttpContext httpContext, IStoreCollection collection, bool isHead)
    {
        var response = httpContext.Response;
        var items = await collection.GetItemsAsync(httpContext).ConfigureAwait(false);

        var html = new StringBuilder();
        html.Append("<html><head><title>WebDAV Listing</title></head><body>");
        html.Append($"<h1>Contents of {System.Net.WebUtility.HtmlEncode(httpContext.Request.Url.AbsolutePath)}</h1>");
        html.Append("<ul>");
        foreach (var child in items)
        {
            var childName = Uri.EscapeDataString(child.Name);
            html.Append($"<li><a href=\"{childName}\">{System.Net.WebUtility.HtmlEncode(child.Name)}</a></li>");
        }
        html.Append("</ul></body></html>");

        var bytes = Encoding.UTF8.GetBytes(html.ToString());

        response.Status = 200;
        response.SetHeaderValue("Content-Type", "text/html; charset=utf-8");
        response.SetHeaderValue("Content-Length", bytes.Length.ToString(CultureInfo.InvariantCulture));

        if (!isHead)
            await response.Stream.WriteAsync(bytes, 0, bytes.Length, CancellationToken.None).ConfigureAwait(false);
    }

    /// <summary>
    /// Writes a file response.
    ///
    /// HEAD resolves size/type from <see cref="IVirtualFileMetadata"/> instead of opening
    /// the content stream. This is essential for virtual files whose stream is produced on
    /// demand: <see cref="VirtualGeneratedBlendFile"/> runs a Blender CLI render and
    /// <see cref="VirtualExtractedTextureFile"/> decodes and re-encodes an image. macOS
    /// issues a HEAD on every file while browsing a folder; opening those streams made the
    /// HEAD hang until the client gave up and dropped the file from Finder.
    ///
    /// Both HEAD and GET always emit Content-Length and Content-Type — macOS webdavfs
    /// treats a file with missing/invalid length metadata as unavailable.
    /// </summary>
    private static async Task WriteFileAsync(IHttpContext httpContext, IStoreItem item, bool isHead)
    {
        var response = httpContext.Response;

        // Fast path: HEAD answered purely from metadata, no stream opened.
        if (isHead && item is IVirtualFileMetadata meta)
        {
            response.Status = 200;
            response.SetHeaderValue("Content-Type", SafeContentType(meta.MimeType));
            response.SetHeaderValue("Content-Length", meta.SizeBytes.ToString(CultureInfo.InvariantCulture));
            response.SetHeaderValue("Accept-Ranges", "none");
            return;
        }

        var stream = await item.GetReadableStreamAsync(httpContext).ConfigureAwait(false);
        if (stream == null || ReferenceEquals(stream, Stream.Null))
        {
            // The underlying content could not be produced (generation failed, file missing).
            response.Status = 404;
            return;
        }

        await using (stream.ConfigureAwait(false))
        {
            response.Status = 200;
            response.SetHeaderValue("Content-Type", SafeContentType((item as IVirtualFileMetadata)?.MimeType));
            response.SetHeaderValue("Accept-Ranges", "none");

            // Advertise the real length of what we are about to send so the client can
            // verify the transfer. Virtual streams are file/memory backed and seekable.
            if (stream.CanSeek)
                response.SetHeaderValue("Content-Length", stream.Length.ToString(CultureInfo.InvariantCulture));

            if (!isHead)
                await stream.CopyToAsync(response.Stream, 81920, CancellationToken.None).ConfigureAwait(false);
        }
    }

    private static string SafeContentType(string? mimeType)
        => string.IsNullOrWhiteSpace(mimeType) ? "application/octet-stream" : mimeType;
}
