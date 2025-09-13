using Application;
using Application.Abstractions.Messaging;
using Application.Models;
using Infrastructure;
using WebApi.Files;

namespace WebApi
{
    public class Program
    {
        public static void Main(string[] args)
        {
            var builder = WebApplication.CreateBuilder(args);

            // Add services to the container.
            builder.Services.AddAuthorization();

            // Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
            builder.Services.AddOpenApi();

            builder.Services
                .AddApplication()
                .AddInfrastructure(builder.Configuration);

            var app = builder.Build();

            // Configure the HTTP request pipeline.
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
            .WithName("Upload Model");

            app.Run();
        }
    }
}
