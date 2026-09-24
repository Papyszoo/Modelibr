using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Models;
using Domain.Projects;
using Domain.Services;
using SharedKernel;

namespace Application.Projects.Profile;

/// <param name="Dimensions">
/// Dimension name → the options assigned to it, with optional roles. A dimension you omit is
/// left alone; a dimension present with an empty list is cleared. Per-dimension rather than
/// wholesale because the UI edits one row at a time, and a wholesale write makes "I only
/// touched Style" indistinguishable from "I cleared Genre".
/// </param>
/// <param name="Settings">
/// A partial settings patch, or null to leave every setting alone. Null scalar values also mean
/// unchanged; <see cref="ProjectProfileSettings.Clear"/> is the explicit operation that clears a field.
/// </param>
public sealed record SetProjectProfileCommand(
    int ProjectId,
    IReadOnlyDictionary<string, IReadOnlyList<ProjectProfileAssignment>>? Dimensions = null,
    ProjectProfileSettings? Settings = null) : ICommand<ProjectBriefDto>;

public sealed record ProjectProfileAssignment(int OptionId, string? Role = null);

public sealed record ProjectProfileSettings(
    int? MaxTrianglesPerAsset = null,
    int? MaxTextureSize = null,
    int? TargetSceneTriangles = null,
    int? PixelsPerUnit = null,
    double? UnitsPerMetre = null,
    string? UpAxis = null,
    string? Handedness = null,
    IReadOnlyList<string>? PaletteHex = null,
    IReadOnlySet<string>? Clear = null);

internal sealed class SetProjectProfileCommandHandler
    : ICommandHandler<SetProjectProfileCommand, ProjectBriefDto>
{
    private static readonly HashSet<string> SettableFields = new(StringComparer.OrdinalIgnoreCase)
    {
        "maxTrianglesPerAsset",
        "maxTextureSize",
        "targetSceneTriangles",
        "pixelsPerUnit",
        "unitsPerMetre",
        "upAxis",
        "handedness",
        "paletteHex",
    };

    private readonly IProjectRepository _projects;
    private readonly IProjectProfileOptionRepository _options;
    private readonly IDateTimeProvider _clock;
    private readonly IUnitOfWork _unitOfWork;

    public SetProjectProfileCommandHandler(
        IProjectRepository projects,
        IProjectProfileOptionRepository options,
        IDateTimeProvider clock,
        IUnitOfWork unitOfWork)
    {
        _projects = projects;
        _options = options;
        _clock = clock;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result<ProjectBriefDto>> Handle(
        SetProjectProfileCommand command, CancellationToken cancellationToken)
    {
        var project = await _projects.GetByIdAsync(command.ProjectId, cancellationToken);
        if (project is null)
        {
            return Result.Failure<ProjectBriefDto>(
                new Error("ProjectNotFound", $"Project with ID {command.ProjectId} was not found."));
        }

        var now = _clock.UtcNow;

        if (command.Dimensions is { Count: > 0 })
        {
            // One lookup for every option named across every dimension, plus the ones the
            // project already carries - SetProfileDimension needs to know which dimension each
            // existing assignment belongs to in order to replace only its own.
            var referenced = command.Dimensions.Values
                .SelectMany(v => v.Select(a => a.OptionId))
                .Concat(project.ProfileValues.Select(v => v.OptionId))
                .Distinct()
                .ToList();

            var options = await _options.GetByIdsAsync(referenced, cancellationToken);
            var dimensionsById = options.ToDictionary(o => o.Id, o => o.Dimension);

            foreach (var (dimension, assignments) in command.Dimensions)
            {
                if (ProjectProfileDimensions.Normalize(dimension) is null)
                {
                    return Result.Failure<ProjectBriefDto>(new Error(
                        "UnknownProfileDimension",
                        $"'{dimension}' is not a profile dimension. Known: {string.Join(", ", ProjectProfileDimensions.All)}."));
                }

                try
                {
                    project.SetProfileDimension(
                        dimension,
                        assignments.ToDictionary(a => a.OptionId, a => a.Role),
                        dimensionsById,
                        now);
                }
                catch (ArgumentException ex)
                {
                    return Result.Failure<ProjectBriefDto>(new Error("InvalidProfileAssignment", ex.Message));
                }
            }
        }

        if (command.Settings is { } settings)
        {
            var clear = settings.Clear?.ToHashSet(StringComparer.OrdinalIgnoreCase)
                ?? new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var unknown = clear.Except(SettableFields, StringComparer.OrdinalIgnoreCase).ToArray();
            if (unknown.Length > 0)
            {
                return Result.Failure<ProjectBriefDto>(new Error(
                    "UnknownProfileSetting",
                    $"Unknown profile settings: {string.Join(", ", unknown)}."));
            }

            var supplied = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase)
            {
                ["maxTrianglesPerAsset"] = settings.MaxTrianglesPerAsset,
                ["maxTextureSize"] = settings.MaxTextureSize,
                ["targetSceneTriangles"] = settings.TargetSceneTriangles,
                ["pixelsPerUnit"] = settings.PixelsPerUnit,
                ["unitsPerMetre"] = settings.UnitsPerMetre,
                ["upAxis"] = settings.UpAxis,
                ["handedness"] = settings.Handedness,
                ["paletteHex"] = settings.PaletteHex,
            };
            var conflict = clear.FirstOrDefault(field => supplied[field] is not null);
            if (conflict is not null)
            {
                return Result.Failure<ProjectBriefDto>(new Error(
                    "ConflictingProfileSetting",
                    $"Profile setting '{conflict}' cannot be supplied and cleared in the same request."));
            }

            try
            {
                project.SetProfileSettings(
                    Resolve("maxTrianglesPerAsset", settings.MaxTrianglesPerAsset, project.MaxTrianglesPerAsset, clear),
                    Resolve("maxTextureSize", settings.MaxTextureSize, project.MaxTextureSize, clear),
                    Resolve("targetSceneTriangles", settings.TargetSceneTriangles, project.TargetSceneTriangles, clear),
                    Resolve("pixelsPerUnit", settings.PixelsPerUnit, project.PixelsPerUnit, clear),
                    Resolve("unitsPerMetre", settings.UnitsPerMetre, project.UnitsPerMetre, clear),
                    Resolve("upAxis", settings.UpAxis, project.UpAxis, clear),
                    Resolve("handedness", settings.Handedness, project.Handedness, clear),
                    Resolve("paletteHex", settings.PaletteHex, project.PaletteHex, clear),
                    now);
            }
            catch (ArgumentException ex)
            {
                return Result.Failure<ProjectBriefDto>(new Error("InvalidProfileSettings", ex.Message));
            }
        }

        await _projects.UpdateAsync(project, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        // Re-read so the brief reports the options' names, which the write only had ids for.
        var saved = await _projects.GetByIdAsync(command.ProjectId, cancellationToken);
        return Result.Success(ProjectBriefBuilder.Build(saved ?? project));
    }

    private static T? Resolve<T>(
        string field,
        T? supplied,
        T? current,
        IReadOnlySet<string> clear)
    {
        if (clear.Contains(field)) return default;
        return supplied ?? current;
    }
}

/// <summary>
/// Adds a vocabulary option a project needs and the built-ins do not have - the reason this
/// is a table and not a C# enum.
/// </summary>
public sealed record CreateProjectProfileOptionCommand(string Dimension, string Name)
    : ICommand<ProjectProfileOptionDto>;

internal sealed class CreateProjectProfileOptionCommandHandler
    : ICommandHandler<CreateProjectProfileOptionCommand, ProjectProfileOptionDto>
{
    private readonly IProjectProfileOptionRepository _options;
    private readonly IDateTimeProvider _clock;
    private readonly IUnitOfWork _unitOfWork;

    public CreateProjectProfileOptionCommandHandler(
        IProjectProfileOptionRepository options,
        IDateTimeProvider clock,
        IUnitOfWork unitOfWork)
    {
        _options = options;
        _clock = clock;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result<ProjectProfileOptionDto>> Handle(
        CreateProjectProfileOptionCommand command, CancellationToken cancellationToken)
    {
        var dimension = ProjectProfileDimensions.Normalize(command.Dimension);
        if (dimension is null)
        {
            return Result.Failure<ProjectProfileOptionDto>(new Error(
                "UnknownProfileDimension",
                $"'{command.Dimension}' is not a profile dimension. Known: {string.Join(", ", ProjectProfileDimensions.All)}."));
        }

        if (string.IsNullOrWhiteSpace(command.Name))
        {
            return Result.Failure<ProjectProfileOptionDto>(
                new Error("InvalidProfileOption", "A profile option needs a name."));
        }

        // Find-or-create rather than refuse: a picker that offers "add 'Roguelike'" and then
        // errors because someone else added it a minute ago is a picker that fails for the
        // wrong reason.
        var normalized = command.Name.Trim().ToLowerInvariant();
        var existing = await _options.GetByNameAsync(dimension, normalized, cancellationToken);
        if (existing is not null)
        {
            return Result.Success(Describe(existing));
        }

        ProjectProfileOption option;
        try
        {
            option = ProjectProfileOption.Create(dimension, command.Name, _clock.UtcNow);
        }
        catch (ArgumentException ex)
        {
            return Result.Failure<ProjectProfileOptionDto>(new Error("InvalidProfileOption", ex.Message));
        }

        await _options.AddAsync(option, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return Result.Success(Describe(option));
    }

    private static ProjectProfileOptionDto Describe(ProjectProfileOption option)
        => new(option.Id, option.Dimension, option.Name, option.IsBuiltIn, option.IsHidden, option.SortOrder);
}
