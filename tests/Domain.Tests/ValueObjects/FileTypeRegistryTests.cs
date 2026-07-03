using System.Reflection;
using Domain.ValueObjects;
using Xunit;

namespace Domain.Tests.ValueObjects;

/// <summary>
/// Drift guards for the FileType registry. The database read side
/// (ApplicationDbContext's FileType converter) resolves persisted strings via
/// FileType.FromValue, which is built from FileType.GetAllTypes(). These tests
/// make it impossible to add a FileType that silently round-trips as Unknown —
/// the bug that shipped for all 19 script types (see prompt 15).
/// </summary>
public class FileTypeRegistryTests
{
    public static TheoryData<string> AllRegisteredValues()
    {
        var data = new TheoryData<string>();
        foreach (var fileType in FileType.GetAllTypes())
        {
            data.Add(fileType.Value);
        }
        return data;
    }

    [Theory]
    [MemberData(nameof(AllRegisteredValues))]
    public void FromValue_WithEveryRegisteredValue_RoundTripsToSameValue(string value)
    {
        var resolved = FileType.FromValue(value);

        Assert.Equal(value, resolved.Value);
    }

    [Fact]
    public void FromValue_WithEveryRegisteredType_ReturnsSameInstance()
    {
        Assert.All(FileType.GetAllTypes(), fileType =>
            Assert.Same(fileType, FileType.FromValue(fileType.Value)));
    }

    [Fact]
    public void FromValue_WithUnknownLegacyString_ReturnsUnknown()
    {
        Assert.Same(FileType.Unknown, FileType.FromValue("no-such-type"));
        Assert.Same(FileType.Unknown, FileType.FromValue(""));
        Assert.Same(FileType.Unknown, FileType.FromValue(null));
    }

    [Fact]
    public void GetAllTypes_Values_AreUniqueIgnoringCase()
    {
        // FromValue is a dictionary keyed by Value — a duplicate would make one
        // type unreachable from the database.
        var values = FileType.GetAllTypes().Select(t => t.Value).ToList();

        Assert.Equal(values.Count, values.Distinct(StringComparer.OrdinalIgnoreCase).Count());
    }

    [Fact]
    public void GetAllTypes_ContainsEveryPredefinedStaticField()
    {
        // The registry list is hand-maintained next to the static fields; this
        // reflection check is what makes forgetting an entry impossible.
        var staticFields = typeof(FileType)
            .GetFields(BindingFlags.Public | BindingFlags.Static)
            .Where(f => f.FieldType == typeof(FileType))
            .Select(f => (FileType)f.GetValue(null)!)
            .ToList();

        var registered = FileType.GetAllTypes();

        Assert.NotEmpty(staticFields);
        Assert.Equal(staticFields.Count, registered.Count);
        foreach (var fieldInstance in staticFields)
        {
            Assert.Contains(fieldInstance, registered);
        }
    }
}
