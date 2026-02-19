namespace WebApi.Infrastructure;

/// <summary>
/// Endpoint filter that validates the X-Api-Key header against the configured WORKER_API_KEY.
/// Applied to worker-facing upload endpoints (preview, thumbnail, waveform).
/// If WORKER_API_KEY is not configured, all requests are allowed (development mode).
/// </summary>
public class WorkerApiKeyFilter : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var configuration = context.HttpContext.RequestServices.GetRequiredService<IConfiguration>();
        var expectedKey = configuration["WORKER_API_KEY"];

        // If no key is configured, allow all requests (development/backward compatibility)
        if (string.IsNullOrEmpty(expectedKey))
        {
            return await next(context);
        }

        var providedKey = context.HttpContext.Request.Headers["X-Api-Key"].FirstOrDefault();

        if (string.IsNullOrEmpty(providedKey) || providedKey != expectedKey)
        {
            return Results.Unauthorized();
        }

        return await next(context);
    }
}
