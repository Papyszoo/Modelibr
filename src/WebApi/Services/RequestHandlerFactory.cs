using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Xml.Linq;
using Microsoft.Extensions.Logging;
using NWebDav.Server;
using NWebDav.Server.Http;
using NWebDav.Server.Stores;
using NWebDav.Server.Handlers;

namespace WebApi.Services;

public class RequestHandlerFactory : IRequestHandlerFactory
{
    private readonly ILoggerFactory _loggerFactory;
    private readonly ILogger<RequestHandlerFactory> _logger;

    public RequestHandlerFactory(ILoggerFactory loggerFactory)
    {
        _loggerFactory = loggerFactory;
        _logger = loggerFactory.CreateLogger<RequestHandlerFactory>();
    }

    public IRequestHandler GetRequestHandler(IHttpContext httpContext)
    {
        if (httpContext.Request.HttpMethod.Equals("PROPFIND", StringComparison.OrdinalIgnoreCase))
        {
            _logger.LogDebug("Returning MacOsPropFindHandler");
            return new MacOsPropFindHandler(_loggerFactory.CreateLogger<MacOsPropFindHandler>());
        }

        _logger.LogDebug("Returning CustomWebDavHandler");
        return new CustomWebDavHandler(_loggerFactory.CreateLogger<CustomWebDavHandler>());
    }
}

/// <summary>
/// PROPFIND handler that wraps NWebDav's native PropFindHandler with two macOS compatibility fixes:
/// 1. Injects a default "allprop" body when the request has no body (macOS sends empty PROPFIND,
///    which is valid per RFC 4918 but NWebDav crashes with XmlException).
/// 2. Post-processes the XML response to ensure collection hrefs end with '/'.
///    macOS Finder requires trailing slashes to distinguish folders from files.
/// </summary>
public class MacOsPropFindHandler : IRequestHandler
{
    private static readonly XNamespace DavNs = "DAV:";

    // Default allprop body per RFC 4918 §9.1: PROPFIND with no body = allprop
    private static readonly byte[] AllPropBody = Encoding.UTF8.GetBytes(
        "<?xml version=\"1.0\" encoding=\"utf-8\"?><D:propfind xmlns:D=\"DAV:\"><D:allprop/></D:propfind>");

    private readonly PropFindHandler _inner = new();
    private readonly ILogger<MacOsPropFindHandler> _logger;

    public MacOsPropFindHandler(ILogger<MacOsPropFindHandler> logger)
    {
        _logger = logger;
    }

    public async Task<bool> HandleRequestAsync(IHttpContext httpContext, IStore store)
    {
        var response = httpContext.Response;

        try
        {
            // Fix 1: If the request body is empty, inject a default allprop body.
            var effectiveContext = await EnsureRequestBodyAsync(httpContext);

            // Fix 2: Buffer the response so we can post-process collection hrefs.
            using var buffer = new MemoryStream();
            var bufferedResponse = new BufferedHttpResponse(response, buffer);
            var bufferedContext = new BufferedHttpContext(effectiveContext, bufferedResponse);

            var handled = await _inner.HandleRequestAsync(bufferedContext, store).ConfigureAwait(false);

            if (response.Status == 207 && buffer.Length > 0)
            {
                buffer.Position = 0;
                var doc = XDocument.Load(buffer);

                // Ensure every collection <href> ends with '/'
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
                doc.Save(patched);

                response.SetHeaderValue("Content-Length", patched.Length.ToString());
                patched.Position = 0;
                await patched.CopyToAsync(response.Stream, 81920, CancellationToken.None).ConfigureAwait(false);
            }
            else if (buffer.Length > 0)
            {
                buffer.Position = 0;
                await buffer.CopyToAsync(response.Stream, 81920, CancellationToken.None).ConfigureAwait(false);
            }

            _logger.LogDebug("PROPFIND completed. Status: {Status}", response.Status);
            return handled;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "PROPFIND handler failed");
            response.Status = 500;
            return true;
        }
    }

    private async Task<IHttpContext> EnsureRequestBodyAsync(IHttpContext httpContext)
    {
        var requestStream = httpContext.Request.Stream;

        // Check if the body is empty
        if (requestStream == null || requestStream == Stream.Null)
        {
            _logger.LogDebug("Empty PROPFIND body, injecting allprop");
            return new BufferedHttpContext(httpContext,
                httpContext.Response,
                new AllPropHttpRequest(httpContext.Request));
        }

        // Some streams might be at position 0 but have no content.
        // Read into a buffer to check.
        if (requestStream.CanSeek)
        {
            if (requestStream.Length == 0)
            {
                _logger.LogDebug("Empty PROPFIND body (seekable), injecting allprop");
                return new BufferedHttpContext(httpContext,
                    httpContext.Response,
                    new AllPropHttpRequest(httpContext.Request));
            }
            return httpContext;
        }

        // Non-seekable stream: buffer it.
        // Do NOT use "using var" — if the body is non-empty we pass this stream to
        // ReplayHttpRequest, which must outlive this method. MemoryStream holds only
        // managed memory so skipping explicit disposal is safe; the GC will collect it.
        var tempBuffer = new MemoryStream();
        await requestStream.CopyToAsync(tempBuffer).ConfigureAwait(false);

        if (tempBuffer.Length == 0)
        {
            _logger.LogDebug("Empty PROPFIND body (non-seekable), injecting allprop");
            return new BufferedHttpContext(httpContext,
                httpContext.Response,
                new AllPropHttpRequest(httpContext.Request));
        }

        // Non-empty: wrap to replay the buffered content
        tempBuffer.Position = 0;
        return new BufferedHttpContext(httpContext,
            httpContext.Response,
            new ReplayHttpRequest(httpContext.Request, tempBuffer));
    }

    #region Wrapper classes

    /// <summary>Wraps IHttpRequest to replace the body stream with a default allprop body.</summary>
    private sealed class AllPropHttpRequest : IHttpRequest
    {
        private readonly IHttpRequest _inner;
        private readonly MemoryStream _stream;

        public AllPropHttpRequest(IHttpRequest inner)
        {
            _inner = inner;
            _stream = new MemoryStream(AllPropBody, writable: false);
        }

        public string HttpMethod => _inner.HttpMethod;
        public Uri Url => _inner.Url;
        public string RemoteEndPoint => _inner.RemoteEndPoint;
        public IEnumerable<string> Headers => _inner.Headers;
        public string GetHeaderValue(string header) => _inner.GetHeaderValue(header);
        public Stream Stream => _stream;
    }

    /// <summary>Wraps IHttpRequest to replay a pre-buffered body stream.</summary>
    private sealed class ReplayHttpRequest : IHttpRequest
    {
        private readonly IHttpRequest _inner;
        private readonly Stream _stream;

        public ReplayHttpRequest(IHttpRequest inner, Stream stream)
        {
            _inner = inner;
            _stream = stream;
        }

        public string HttpMethod => _inner.HttpMethod;
        public Uri Url => _inner.Url;
        public string RemoteEndPoint => _inner.RemoteEndPoint;
        public IEnumerable<string> Headers => _inner.Headers;
        public string GetHeaderValue(string header) => _inner.GetHeaderValue(header);
        public Stream Stream => _stream;
    }

    /// <summary>Wraps IHttpResponse to redirect writes to a buffer.</summary>
    private sealed class BufferedHttpResponse : IHttpResponse
    {
        private readonly IHttpResponse _inner;
        public BufferedHttpResponse(IHttpResponse inner, Stream buffer)
        {
            _inner = inner;
            Stream = buffer;
        }
        public int Status { get => _inner.Status; set => _inner.Status = value; }
        public string StatusDescription { get => _inner.StatusDescription; set => _inner.StatusDescription = value; }
        public Stream Stream { get; }
        public void SetHeaderValue(string header, string value) => _inner.SetHeaderValue(header, value);
    }

    /// <summary>Wraps IHttpContext allowing response and/or request substitution.</summary>
    private sealed class BufferedHttpContext : IHttpContext
    {
        private readonly IHttpContext _inner;
        public BufferedHttpContext(IHttpContext inner, IHttpResponse response, IHttpRequest? request = null)
        {
            _inner = inner;
            Response = response;
            Request = request ?? inner.Request;
        }
        public IHttpRequest Request { get; }
        public IHttpResponse Response { get; }
        public NWebDav.Server.Http.IHttpSession Session => _inner.Session;
        public Task CloseAsync() => _inner.CloseAsync();
    }

    #endregion
}
