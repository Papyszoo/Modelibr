using SharedKernel;

namespace Domain.Models;

public class Environment : AggregateRoot
{
    public int Id { get; set; }
    public string Name { get; private set; } = string.Empty;
    public string ConfigurationJson { get; private set; } = string.Empty;
    public DateTime CreatedAt { get; private set; }
    public DateTime UpdatedAt { get; private set; }

    private Environment() { } // For EF Core

    private Environment(string name, string configurationJson)
    {
        Name = name;
        ConfigurationJson = configurationJson;
        CreatedAt = DateTime.UtcNow;
        UpdatedAt = DateTime.UtcNow;
    }

    public static Result<Environment> Create(string name, string configurationJson)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            return Result.Failure<Environment>(new Error("Environment.InvalidName", "Environment name cannot be empty"));
        }

        if (string.IsNullOrWhiteSpace(configurationJson))
        {
            return Result.Failure<Environment>(new Error("Environment.InvalidConfiguration", "Environment configuration cannot be empty"));
        }

        var environment = new Environment(name, configurationJson);
        return Result.Success(environment);
    }

    public Result UpdateConfiguration(string configurationJson)
    {
        if (string.IsNullOrWhiteSpace(configurationJson))
        {
            return Result.Failure(new Error("Environment.InvalidConfiguration", "Environment configuration cannot be empty"));
        }

        ConfigurationJson = configurationJson;
        UpdatedAt = DateTime.UtcNow;
        return Result.Success();
    }

    public Result UpdateName(string name)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            return Result.Failure(new Error("Environment.InvalidName", "Environment name cannot be empty"));
        }

        Name = name;
        UpdatedAt = DateTime.UtcNow;
        return Result.Success();
    }
}
