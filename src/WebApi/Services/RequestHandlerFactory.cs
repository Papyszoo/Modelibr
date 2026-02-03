using System;
using System.Threading.Tasks;
using NWebDav.Server;
using NWebDav.Server.Http;
using NWebDav.Server.Stores;
using NWebDav.Server.Handlers;

namespace WebApi.Services;

public class RequestHandlerFactory : IRequestHandlerFactory
{
    public IRequestHandler GetRequestHandler(IHttpContext httpContext)
    {
        Console.WriteLine($"[RequestHandlerFactory] Returning CustomWebDavHandler unconditionally");
        return new CustomWebDavHandler();
    }
}

public class LoggingPropFindHandler : IRequestHandler
{
    private readonly PropFindHandler _inner = new PropFindHandler();

    public async Task<bool> HandleRequestAsync(IHttpContext httpContext, IStore store)
    {
        Console.WriteLine("[LoggingPropFindHandler] Starting HandleRequestAsync");
        try
        {
            var result = await _inner.HandleRequestAsync(httpContext, store);
            Console.WriteLine($"[LoggingPropFindHandler] Completed. Result: {result}, Status: {httpContext.Response.Status}");
            return result;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[LoggingPropFindHandler] ERROR: {ex}");
            throw; 
        }
    }
}
