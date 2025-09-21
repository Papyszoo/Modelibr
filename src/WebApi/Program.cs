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

            app.Run();
        }
    }
}
