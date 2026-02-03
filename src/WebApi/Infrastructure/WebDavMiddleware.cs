using NWebDav.Server;
using NWebDav.Server.AspNetCore;
using NWebDav.Server.Stores;

namespace WebApi.Infrastructure;

/// <summary>
/// Middleware to handle WebDAV requests for the virtual asset drive.
/// </summary>
public class WebDavMiddleware
{
    private readonly RequestDelegate _next;
    private readonly string _pathPrefix;
    private readonly IStore _store;
    private readonly WebDavDispatcher _dispatcher;

    public WebDavMiddleware(RequestDelegate next, string pathPrefix, IStore store, IRequestHandlerFactory requestHandlerFactory)
    {
        _next = next;
        _pathPrefix = pathPrefix.TrimEnd('/');
        _store = store;
        _dispatcher = new WebDavDispatcher(store, requestHandlerFactory);
    }

    public async Task InvokeAsync(HttpContext context)
    {
        // Check if this is a WebDAV request for our path
        if (!context.Request.Path.StartsWithSegments(_pathPrefix, StringComparison.OrdinalIgnoreCase))
        {
            await _next(context);
            return;
        }

        // Handle WebDAV request
        var httpContext = new AspNetCoreContext(context);
        await _dispatcher.DispatchRequestAsync(httpContext);
    }
}

/// <summary>
/// Extension methods for WebDAV middleware registration.
/// </summary>
public static class WebDavMiddlewareExtensions
{
    /// <summary>
    /// Adds WebDAV endpoint at the specified path.
    /// </summary>
    public static IApplicationBuilder UseWebDav(this IApplicationBuilder app, string path = "/dav")
    {
        var store = app.ApplicationServices.GetRequiredService<IStore>();
        var requestHandlerFactory = app.ApplicationServices.GetRequiredService<IRequestHandlerFactory>();

        return app.UseMiddleware<WebDavMiddleware>(path, store, requestHandlerFactory);
    }
}
