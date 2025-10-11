using SharedKernel;

namespace Domain.Models;

public class Scene : AggregateRoot
{
    public int Id { get; set; }
    public string Name { get; private set; } = string.Empty;
    public string ConfigurationJson { get; private set; } = string.Empty;
    public DateTime CreatedAt { get; private set; }
    public DateTime UpdatedAt { get; private set; }

    private Scene() { } // For EF Core

    private Scene(string name, string configurationJson)
    {
        Name = name;
        ConfigurationJson = configurationJson;
        CreatedAt = DateTime.UtcNow;
        UpdatedAt = DateTime.UtcNow;
    }

    public static Result<Scene> Create(string name, string configurationJson)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            return Result.Failure<Scene>(new Error("Scene.InvalidName", "Scene name cannot be empty"));
        }

        if (string.IsNullOrWhiteSpace(configurationJson))
        {
            return Result.Failure<Scene>(new Error("Scene.InvalidConfiguration", "Scene configuration cannot be empty"));
        }

        var scene = new Scene(name, configurationJson);
        return Result.Success(scene);
    }

    public Result UpdateConfiguration(string configurationJson)
    {
        if (string.IsNullOrWhiteSpace(configurationJson))
        {
            return Result.Failure(new Error("Scene.InvalidConfiguration", "Scene configuration cannot be empty"));
        }

        ConfigurationJson = configurationJson;
        UpdatedAt = DateTime.UtcNow;
        return Result.Success();
    }

    public Result UpdateName(string name)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            return Result.Failure(new Error("Scene.InvalidName", "Scene name cannot be empty"));
        }

        Name = name;
        UpdatedAt = DateTime.UtcNow;
        return Result.Success();
    }
}
