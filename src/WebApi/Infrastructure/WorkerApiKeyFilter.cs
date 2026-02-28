namespace WebApi.Infrastructure;

/// <summary>
/// Endpoint filter that validates the X-Api-Key header against the configured WORKER_API_KEY.
/// Applied to worker-facing upload endpoints (preview, thumbnail, waveform).
/// If WORKER_API_KEY is not configured in Development, requests are allowed for backward compatibility.
/// In non-Development environments, missing WORKER_API_KEY results in Unauthorized.
/// </summary>
public class WorkerApiKeyFilter : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var configuration = context.HttpContext.RequestServices.GetRequiredService<IConfiguration>();
        var expectedKey = configuration["WORKER_API_KEY"];

        if (string.IsNullOrEmpty(expectedKey))
        {
            var environment = context.HttpContext.RequestServices.GetRequiredService<IWebHostEnvironment>();
            if (environment.IsDevelopment())
            {
                return await next(context);
            }

            return Results.Unauthorized();
        }

        var providedKey = context.HttpContext.Request.Headers["X-Api-Key"].FirstOrDefault();

        if (string.IsNullOrEmpty(providedKey) || providedKey != expectedKey)
        {
            return Results.Unauthorized();
        }

        return await next(context);
    }
}
