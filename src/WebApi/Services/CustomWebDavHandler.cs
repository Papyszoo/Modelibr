using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.Xml.Linq;
using NWebDav.Server;
using NWebDav.Server.Http;
using NWebDav.Server.Stores;

namespace WebApi.Services;

public class CustomWebDavHandler : IRequestHandler
{
    private static readonly XNamespace DavNs = "DAV:";

    public async Task<bool> HandleRequestAsync(IHttpContext httpContext, IStore store)
    {
        var request = httpContext.Request;
        Console.WriteLine($"[CustomWebDavHandler] Handling {request.HttpMethod} {request.Url}");

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
            Console.WriteLine($"[CustomWebDavHandler] GET Error: {ex}");
            response.Status = 500;
            return true;
        }
    }

    private async Task<bool> HandlePropFindAsync(IHttpContext httpContext, IStore store)
    {
        var request = httpContext.Request;
        var response = httpContext.Response;

        try
        {
            // 1. Get Item
            var item = await store.GetItemAsync(request.Url, httpContext).ConfigureAwait(false);
            if (item == null)
            {
                Console.WriteLine("[CustomWebDavHandler] Item not found.");
                response.Status = 404;
                return true;
            }

            // 2. Determine Depth
            var depthHeader = request.GetHeaderValue("Depth");
            int depth = 1; 
            if (depthHeader == "0") depth = 0;
            else if (depthHeader == "1") depth = 1;

            // 3. Multistatus XML
            var multistatus = new XElement(DavNs + "multistatus");
            
            // Add self
            await AddResponseAsync(multistatus, item, request.Url);

            // Add children if collection and depth > 0
            if (depth > 0 && item is IStoreCollection collection)
            {
                foreach (var child in await collection.GetItemsAsync(httpContext).ConfigureAwait(false))
                {
                     // Use proper URI construction
                     var baseUri = request.Url.ToString().TrimEnd('/');
                     // Encode path segments
                     var childName = Uri.EscapeDataString(child.Name); 
                     var childUri = new Uri(baseUri + "/" + childName);
                     await AddResponseAsync(multistatus, child, childUri);
                }
            }

            var doc = new XDocument(new XDeclaration("1.0", "utf-8", null), multistatus);

            response.Status = 207; // Multi-Status
            response.SetHeaderValue("Content-Type", "text/xml; charset=\"utf-8\"");
            
            // Buffer to MemoryStream to avoid Sync I/O Kestrel errors
            using (var ms = new MemoryStream())
            {
                doc.Save(ms);
                ms.Position = 0;
                await ms.CopyToAsync(response.Stream, 81920, CancellationToken.None);
            }
            
            return true;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[CustomWebDavHandler] PROPFIND Error: {ex}");
            response.Status = 500;
            return true;
        }
    }

    private async Task AddResponseAsync(XElement multistatus, IStoreItem item, Uri uri)
    {
        var href = new XElement(DavNs + "href", uri.AbsoluteUri);
        
        var prop = new XElement(DavNs + "prop");
        
        // ResourceType
        if (item is IStoreCollection)
            prop.Add(new XElement(DavNs + "resourcetype", new XElement(DavNs + "collection")));
        else
            prop.Add(new XElement(DavNs + "resourcetype"));

        // DisplayName
        prop.Add(new XElement(DavNs + "displayname", item.Name));
        
        var propstat = new XElement(DavNs + "propstat",
            prop,
            new XElement(DavNs + "status", "HTTP/1.1 200 OK")
        );

        var response = new XElement(DavNs + "response", href, propstat);
        multistatus.Add(response);
    }
}
