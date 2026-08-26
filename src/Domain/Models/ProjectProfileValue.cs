namespace Domain.Models;

/// <summary>
/// A project's assignment of one <see cref="ProjectProfileOption"/>.
/// </summary>
/// <remarks>
/// <see cref="Role"/> lives on the assignment rather than on the option because it is a fact
/// about this project's use of it: <c>Blender</c> is one option, and it is the authoring
/// engine here and could be the runtime engine somewhere else. Free text on purpose -
/// "authoring" / "runtime" / "preview" is a convention worth suggesting in a picker and not
/// worth a sixth vocabulary.
/// </remarks>
public class ProjectProfileValue
{
    public int ProjectId { get; private set; }
    public int OptionId { get; private set; }
    public string? Role { get; private set; }

    public ProjectProfileOption Option { get; private set; } = null!;

    private ProjectProfileValue() { }

    public static ProjectProfileValue Create(int projectId, int optionId, string? role)
        => new()
        {
            ProjectId = projectId,
            OptionId = optionId,
            Role = string.IsNullOrWhiteSpace(role) ? null : role.Trim()
        };

    public void SetRole(string? role)
        => Role = string.IsNullOrWhiteSpace(role) ? null : role.Trim();
}
