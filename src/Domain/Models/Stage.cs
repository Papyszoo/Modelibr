using SharedKernel;

namespace Domain.Models;

public class Stage : AggregateRoot
{
    public int Id { get; private set; }
    public string Name { get; private set; } = string.Empty;
    public string ConfigurationJson { get; private set; } = string.Empty;
    public DateTime CreatedAt { get; private set; }
    public DateTime UpdatedAt { get; private set; }

    private Stage() { } // For EF Core

    private Stage(string name, string configurationJson)
    {
        Name = name;
        ConfigurationJson = configurationJson;
        CreatedAt = DateTime.UtcNow;
        UpdatedAt = DateTime.UtcNow;
    }

    public static Result<Stage> Create(string name, string configurationJson)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            return Result.Failure<Stage>(new Error("Stage.InvalidName", "Stage name cannot be empty"));
        }

        if (string.IsNullOrWhiteSpace(configurationJson))
        {
            return Result.Failure<Stage>(new Error("Stage.InvalidConfiguration", "Stage configuration cannot be empty"));
        }

        var stage = new Stage(name, configurationJson);
        return Result.Success(stage);
    }

    public Result UpdateConfiguration(string configurationJson)
    {
        if (string.IsNullOrWhiteSpace(configurationJson))
        {
            return Result.Failure(new Error("Stage.InvalidConfiguration", "Stage configuration cannot be empty"));
        }

        ConfigurationJson = configurationJson;
        UpdatedAt = DateTime.UtcNow;
        return Result.Success();
    }

    public Result UpdateName(string name)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            return Result.Failure(new Error("Stage.InvalidName", "Stage name cannot be empty"));
        }

        Name = name;
        UpdatedAt = DateTime.UtcNow;
        return Result.Success();
    }
}
