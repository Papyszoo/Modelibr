using Application;
using Infrastructure;
using WebApi.Endpoints;
using WebApi.Infrastructure;
using WebApi.Services;
using WebApi.Extensions;
using Application.Abstractions.Storage;
using Infrastructure.Storage;

namespace WebApi
{
    public class Program
    {
        public static async Task Main(string[] args)
        {
            var builder = WebApplication.CreateBuilder(args);

            builder.Services.AddAuthorization();

            // Add CORS for frontend development
            builder.Services.AddCors();

            builder.Services.AddOpenApi();

            builder.Services
                .AddApplication()
                .AddInfrastructure(builder.Configuration);

            builder.Services.AddSingleton<IUploadPathProvider, UploadPathProvider>();
            builder.Services.AddSingleton<IFileStorage, HashBasedFileStorage>();
            builder.Services.AddHostedService<UploadDirectoryInitializer>();

            var app = builder.Build();

            // Initialize database
            await app.InitializeDatabaseAsync();

            if (app.Environment.IsDevelopment())
            {
                app.MapOpenApi();
            }

            app.UseHttpsRedirection();

            // Add CORS for frontend development
            app.UseCors(policy => policy
                .AllowAnyOrigin()
                .AllowAnyMethod()
                .AllowAnyHeader());

            app.UseAuthorization();

            // Map endpoints
            app.MapHealthCheckEndpoints();
            app.MapModelEndpoints();
            app.MapModelsEndpoints();
            app.MapFilesEndpoints();

            app.Run();
        }
    }
}
