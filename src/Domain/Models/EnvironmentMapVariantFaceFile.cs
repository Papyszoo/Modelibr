namespace Domain.Models;

public class EnvironmentMapVariantFaceFile
{
    public int Id { get; private set; }
    public int EnvironmentMapVariantId { get; private set; }
    public EnvironmentMapCubeFace Face { get; private set; }
    public int FileId { get; private set; }

    public File File { get; private set; } = null!;

    public static EnvironmentMapVariantFaceFile Create(EnvironmentMapCubeFace face, File file)
    {
        ArgumentNullException.ThrowIfNull(file);

        return new EnvironmentMapVariantFaceFile
        {
            Face = face,
            FileId = file.Id,
            File = file
        };
    }
}
