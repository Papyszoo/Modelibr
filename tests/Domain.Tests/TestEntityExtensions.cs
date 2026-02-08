using System.Reflection;

namespace Domain.Tests;

/// <summary>
/// Extension methods for setting private Id properties on domain entities in tests.
/// EF Core sets these via reflection; tests need to do the same.
/// </summary>
public static class TestEntityExtensions
{
    public static T WithId<T>(this T entity, int id) where T : class
    {
        var property = typeof(T).GetProperty("Id", BindingFlags.Public | BindingFlags.Instance)
            ?? throw new InvalidOperationException($"Type {typeof(T).Name} does not have a public Id property.");

        property.SetValue(entity, id);
        return entity;
    }
}
