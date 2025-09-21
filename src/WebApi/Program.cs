using Application;
using Application.Abstractions.Messaging;
using Application.Models;
using Infrastructure;
using WebApi.Files;
using WebApi.Infrastructure;
using Application.Abstractions.Storage;
using Infrastructure.Storage;

namespace WebApi
{
    public class Program
    {
        public static void Main(string[] args)
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

            app.MapPost("/uploadModel", async (IFormFile file, ICommandHandler<AddModelCommand, AddModelCommandResponse> commandHandler) =>
            {
                if (file.Length > 0)
                {
                    var result = await commandHandler.Handle(new AddModelCommand(new FormFileUpload(file)), CancellationToken.None);

                    return Results.Ok(result);
                }
                return Results.BadRequest("Invalid file.");
            })
            .WithName("Upload Model")
            .DisableAntiforgery();

            app.MapGet("/models", async (IQueryHandler<GetAllModelsQuery, GetAllModelsQueryResponse> queryHandler) =>
            {
                var result = await queryHandler.Handle(new GetAllModelsQuery(), CancellationToken.None);
                
                return Results.Ok(result);
            })
            .WithName("Get All Models");

            app.MapGet("/models/{id}/file", async (int id, IQueryHandler<GetAllModelsQuery, GetAllModelsQueryResponse> queryHandler, IUploadPathProvider pathProvider) =>
            {
                var result = await queryHandler.Handle(new GetAllModelsQuery(), CancellationToken.None);
                
                if (!result.IsSuccess)
                {
                    return Results.Problem("Failed to retrieve models");
                }

                var model = result.Value.Models.FirstOrDefault(m => m.Id == id);
                if (model == null)
                {
                    return Results.NotFound("Model not found");
                }

                var fullPath = Path.Combine(pathProvider.UploadRootPath, model.FilePath);
                if (!File.Exists(fullPath))
                {
                    return Results.NotFound("Model file not found");
                }

                var fileStream = File.OpenRead(fullPath);
                var contentType = GetContentType(model.FilePath);
                
                return Results.File(fileStream, contentType, enableRangeProcessing: true);
            })
            .WithName("Get Model File");

            app.Run();
        }

        private static string GetContentType(string filePath)
        {
            var extension = Path.GetExtension(filePath).ToLowerInvariant();
            return extension switch
            {
                ".obj" => "text/plain",
                ".fbx" => "application/octet-stream",
                ".dae" => "application/xml",
                ".3ds" => "application/octet-stream",
                ".blend" => "application/octet-stream",
                ".gltf" => "application/json",
                ".glb" => "application/octet-stream",
                _ => "application/octet-stream"
            };
        }
    }
}
