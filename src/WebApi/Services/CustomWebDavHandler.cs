using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.Xml.Linq;
using Microsoft.Extensions.Logging;
using NWebDav.Server;
using NWebDav.Server.Handlers;
using NWebDav.Server.Http;
using NWebDav.Server.Stores;

namespace WebApi.Services;

public class CustomWebDavHandler : IRequestHandler
{
    private static readonly XNamespace DavNs = "DAV:";
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
                return await HandleOptionsAsync(httpContext);
            case "PROPFIND":
                return await HandlePropFindAsync(httpContext, store);
            case "GET":
            case "HEAD":
                return await HandleGetHeadAsync(httpContext, store);
            default:
                // Let other handlers (if any) generally handle it, or fail.
                // Since this is the "only" handler in our factory, we probably return false -> 501/404.
                return false;
        }
    }

    private Task<bool> HandleOptionsAsync(IHttpContext httpContext)
    {
        var response = httpContext.Response;
        
        // Critical WebDAV Compliance Headers
        response.SetHeaderValue("Dav", "1, 2");
        response.SetHeaderValue("MS-Author-Via", "DAV");
        response.SetHeaderValue("Allow", "OPTIONS, GET, HEAD, POST, PUT, DELETE, TRACE, COPY, MOVE, MKCOL, PROPFIND, PROPPATCH, LOCK, UNLOCK");
        response.SetHeaderValue("Public", "OPTIONS, GET, HEAD, POST, PUT, DELETE, TRACE, COPY, MOVE, MKCOL, PROPFIND, PROPPATCH, LOCK, UNLOCK");

        response.Status = 200;
        return Task.FromResult(true);
    }

    private async Task<bool> HandleGetHeadAsync(IHttpContext httpContext, IStore store)
    {
        var request = httpContext.Request;
        var response = httpContext.Response;
        var isHead = request.HttpMethod == "HEAD";

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
                // Generate HTML directory listing
                var items = await collection.GetItemsAsync(httpContext).ConfigureAwait(false);
                var htmlBuilder = new System.Text.StringBuilder();
                htmlBuilder.Append("<html><head><title>WebDAV Listing</title></head><body>");
                htmlBuilder.Append($"<h1>Contents of {request.Url.AbsolutePath}</h1>");
                htmlBuilder.Append("<ul>");
                foreach (var child in items)
                {
                    var childName = Uri.EscapeDataString(child.Name);
                    htmlBuilder.Append($"<li><a href=\"{childName}\">{System.Net.WebUtility.HtmlEncode(child.Name)}</a></li>");
                }
                htmlBuilder.Append("</ul></body></html>");
                
                var htmlBytes = System.Text.Encoding.UTF8.GetBytes(htmlBuilder.ToString());
                
                response.Status = 200;
                response.SetHeaderValue("Content-Type", "text/html; charset=utf-8");
                
                if (!isHead)
                {
                    await response.Stream.WriteAsync(htmlBytes, 0, htmlBytes.Length, CancellationToken.None);
                }
                return true;
            }

            if (item is IStoreItem storeItem)
            {
                // Serve file
                // Stream?
                // IStoreItem stream access?
                var stream = await storeItem.GetReadableStreamAsync(httpContext).ConfigureAwait(false);
                if (stream == null)
                {
                    response.Status = 404; // Or 500
                    return true;
                }

                // Headers
                // Content-Type? storeItem.PropertyManager?
                // Let's set generic binary if unknown.
                response.Status = 200;
                
                // Content-Length?
                // response.SetHeaderValue("Content-Length", stream.Length.ToString()); 

                if (!isHead)
                {
                   using (stream)
                   {
                       // Async copy to response
                       await stream.CopyToAsync(response.Stream, 81920, CancellationToken.None);
                   }
                }
            }

            return true;
        }
        catch(Exception ex)
        {
            _logger.LogError(ex, "GET request failed");
            response.Status = 500;
            return true;
        }
    }

    private async Task<bool> HandlePropFindAsync(IHttpContext httpContext, IStore store)
    {
        var response = httpContext.Response;

        try
        {
            // Buffer the native PropFindHandler output into a MemoryStream for two reasons:
            //   1. Kestrel blocks synchronous writes; buffering avoids that exception.
            //   2. We need to post-process the XML to append trailing slashes on collection
            //      <href> values, which macOS Finder requires to distinguish folders from files.
            //      Without them Finder treats child folders as the parent and loops infinitely,
            //      exhausting file descriptors and crashing with malloc/too_many_files_open.
            using var buffer = new MemoryStream();
            var macOsResponse = new MacOsHttpResponse(response, buffer);
            var macOsContext = new MacOsHttpContext(httpContext, macOsResponse);

            var nativeHandler = new PropFindHandler();
            var handled = await nativeHandler.HandleRequestAsync(macOsContext, store).ConfigureAwait(false);

            // Only patch 207 Multi-Status responses that have XML body content.
            if (response.Status == 207 && buffer.Length > 0)
            {
                buffer.Position = 0;
                var doc = XDocument.Load(buffer);

                // Ensure every collection <href> ends with '/' so macOS Finder can
                // distinguish folders from files without re-issuing a PROPFIND on the same URL.
                foreach (var responseEl in doc.Descendants(DavNs + "response"))
                {
                    var isCollection = responseEl
                        .Descendants(DavNs + "resourcetype")
                        .Any(rt => rt.Element(DavNs + "collection") != null);

                    if (!isCollection)
                        continue;

                    var hrefEl = responseEl.Element(DavNs + "href");
                    if (hrefEl != null && !hrefEl.Value.EndsWith("/"))
                        hrefEl.Value += "/";
                }

                using var patched = new MemoryStream();
                patched.Position = 0;
                doc.Save(patched);

                response.SetHeaderValue("Content-Length", patched.Length.ToString());
                patched.Position = 0;
                await patched.CopyToAsync(response.Stream, 81920, CancellationToken.None).ConfigureAwait(false);
            }
            else if (buffer.Length > 0)
            {
                // Non-207 response (e.g. 404) — pass through as-is.
                buffer.Position = 0;
                await buffer.CopyToAsync(response.Stream, 81920, CancellationToken.None).ConfigureAwait(false);
            }

            return handled;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "PROPFIND request failed");
            response.Status = 500;
            return true;
        }
    }

    private class MacOsHttpResponse : IHttpResponse
    {
        private readonly IHttpResponse _inner;
        public MacOsHttpResponse(IHttpResponse inner, Stream stream)
        {
            _inner = inner;
            Stream = stream;
        }
        public int Status { get => _inner.Status; set => _inner.Status = value; }
        public string StatusDescription { get => _inner.StatusDescription; set => _inner.StatusDescription = value; }
        public Stream Stream { get; }
        public void SetHeaderValue(string header, string value) => _inner.SetHeaderValue(header, value);
    }

    private class MacOsHttpContext : IHttpContext
    {
        private readonly IHttpContext _inner;
        public MacOsHttpContext(IHttpContext inner, IHttpResponse response)
        {
            _inner = inner;
            Response = response;
        }
        public IHttpRequest Request => _inner.Request;
        public IHttpResponse Response { get; }
        public NWebDav.Server.Http.IHttpSession Session => _inner.Session;
        public Task CloseAsync() => _inner.CloseAsync();
    }
}
