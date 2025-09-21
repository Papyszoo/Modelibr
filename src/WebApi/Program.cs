using Application;
using Application.Abstractions.Messaging;
using Application.Models;
using Application.Files;
using Infrastructure;
using WebApi.Files;
using WebApi.Infrastructure;
using WebApi.Services;
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

            // New endpoint to serve files directly by file ID
            app.MapGet("/files/{id}", async (int id, IQueryHandler<GetFileQuery, GetFileQueryResponse> queryHandler) =>
            {
                var result = await queryHandler.Handle(new GetFileQuery(id), CancellationToken.None);
                
                if (!result.IsSuccess)
                {
                    return Results.NotFound(result.Error.Message);
                }

                var fileStream = System.IO.File.OpenRead(result.Value.FullPath);
                var contentType = ContentTypeProvider.GetContentType(result.Value.OriginalFileName);
                
                return Results.File(fileStream, contentType, result.Value.OriginalFileName, enableRangeProcessing: true);
            })
            .WithName("Get File");

            app.Run();
        }
    }
}
