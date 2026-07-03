using Domain.ValueObjects;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using Xunit;
using DomainFile = Domain.Models.File;

namespace Infrastructure.Tests.Persistence;

/// <summary>
/// Proves the DbContext's configured FileType converter round-trips every
/// registered FileType — i.e. that the model is actually wired to
/// FileType.FromValue and not to a hand-maintained mapping that can drift
/// (the pre-fix switch silently mapped all 19 script types to Unknown).
/// InMemory is used ONLY to build the model metadata; no queries run, so no
/// provider-specific behavior is being trusted here (a real-Postgres
/// round-trip belongs to prompt 43's integration layer).
/// </summary>
public class FileTypeConverterTests
{
    private static ValueConverter GetConfiguredFileTypeConverter()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;
        using var context = new ApplicationDbContext(options);

        var property = context.Model
            .FindEntityType(typeof(DomainFile))!
            .FindProperty(nameof(DomainFile.FileType))!;

        var converter = property.GetValueConverter();
        Assert.NotNull(converter);
        return converter!;
    }

    [Fact]
    public void ConfiguredConverter_RoundTrips_EveryRegisteredFileType()
    {
        var converter = GetConfiguredFileTypeConverter();

        Assert.All(FileType.GetAllTypes(), fileType =>
        {
            var stored = converter.ConvertToProvider(fileType);
            var restored = converter.ConvertFromProvider(stored);

            Assert.Equal(fileType.Value, Assert.IsType<string>(stored));
            Assert.Same(fileType, Assert.IsType<FileType>(restored));
        });
    }

    [Fact]
    public void ConfiguredConverter_UnrecognizedStoredString_FallsBackToUnknown()
    {
        var converter = GetConfiguredFileTypeConverter();

        var restored = converter.ConvertFromProvider("legacy-value-never-registered");

        Assert.Same(FileType.Unknown, restored);
    }
}
