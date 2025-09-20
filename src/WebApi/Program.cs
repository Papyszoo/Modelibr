using Application;
using Application.Abstractions.Messaging;
using Application.Models;
using Infrastructure;
using Infrastructure.Persistence;
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

            builder.Services.AddEndpointsApiExplorer();
            builder.Services.AddSwaggerGen();

            builder.Services
                .AddApplication()
                .AddInfrastructure(builder.Configuration);

            builder.Services.AddSingleton<IUploadPathProvider, UploadPathProvider>();
            builder.Services.AddSingleton<IFileStorage, HashBasedFileStorage>();
            builder.Services.AddHostedService<UploadDirectoryInitializer>();

            var app = builder.Build();

            // Ensure database is created (for development)
            if (app.Environment.IsDevelopment())
            {
                using var scope = app.Services.CreateScope();
                var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                context.Database.EnsureCreated();
            }

            if (app.Environment.IsDevelopment())
            {
                app.UseSwagger();
                app.UseSwaggerUI();
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

            app.Run();
        }
    }
}
