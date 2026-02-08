using System;
using System.Threading.Tasks;
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
        _logger.LogDebug("Returning CustomWebDavHandler");
        return new CustomWebDavHandler(_loggerFactory.CreateLogger<CustomWebDavHandler>());
    }
}

public class LoggingPropFindHandler : IRequestHandler
{
    private readonly PropFindHandler _inner = new PropFindHandler();
    private readonly ILogger<LoggingPropFindHandler> _logger;

    public LoggingPropFindHandler(ILogger<LoggingPropFindHandler> logger)
    {
        _logger = logger;
    }

    public async Task<bool> HandleRequestAsync(IHttpContext httpContext, IStore store)
    {
        _logger.LogDebug("Starting HandleRequestAsync");
        try
        {
            var result = await _inner.HandleRequestAsync(httpContext, store);
            _logger.LogDebug("Completed. Result: {Result}, Status: {Status}", result, httpContext.Response.Status);
            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "PropFind handler failed");
            throw; 
        }
    }
}
