using System.Globalization;
using Domain.Models;
using Domain.Projects;

namespace Application.Projects.Profile;

/// <summary>
/// Turns a stored project profile into the brief an agent reads (prompt 13-D1).
///
/// <para>
/// A pure function of the loaded project, so the thing that decides what an agent is told can
/// be tested without a database - and so the readings it performs (the budget suggestion, the
/// engine conversions, the style signals) stay readings. Persisting any of them would freeze
/// a mapping that is expected to be corrected.
/// </para>
/// </summary>
public static class ProjectBriefBuilder
{
    public static ProjectBriefDto Build(Project project)
    {
        var byDimension = project.ProfileValues
            .Where(v => v.Option is not null)
            .GroupBy(v => v.Option.Dimension, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(
                g => g.Key,
                g => (IReadOnlyList<ProjectProfileValueDto>)g
                    .OrderBy(v => v.Option.SortOrder)
                    .ThenBy(v => v.Option.Name, StringComparer.Ordinal)
                    .Select(v => new ProjectProfileValueDto(v.OptionId, v.Option.Name, v.Role))
                    .ToList(),
                StringComparer.OrdinalIgnoreCase);

        var engines = Values(byDimension, ProjectProfileDimensions.Engine);
        var platforms = Values(byDimension, ProjectProfileDimensions.Platform);
        var genres = Values(byDimension, ProjectProfileDimensions.Genre);
        var styles = Values(byDimension, ProjectProfileDimensions.Style);
        var perspectives = Values(byDimension, ProjectProfileDimensions.Perspective);

        var budget = new ProjectBudgetDto(
            project.MaxTrianglesPerAsset,
            project.MaxTextureSize,
            project.TargetSceneTriangles,
            project.PixelsPerUnit);

        var suggestion = BuildSuggestion(platforms);
        var convention = BuildConvention(project, engines);
        var signals = BuildStyleSignals(styles);

        var counts = new ProjectAssetCountsDto(
            project.Models.Count,
            project.TextureSets.Count,
            project.Sprites.Count,
            project.Sounds.Count,
            project.Scripts.Count,
            project.EnvironmentMaps.Count,
            project.Scenes.Count);

        return new ProjectBriefDto(
            project.Id,
            project.Name,
            project.Description,
            project.Notes,
            engines,
            platforms,
            genres,
            styles,
            perspectives,
            budget,
            suggestion,
            convention,
            signals,
            project.PaletteHex.ToList(),
            project.ConceptImages
                .OrderBy(ci => ci.SortOrder)
                .Select(ci => new ProjectConceptImageBriefDto(
                    ci.FileId,
                    ci.File?.OriginalFileName ?? $"file-{ci.FileId}",
                    // A served URL, never a host filesystem path: a path is not viewable by
                    // an MCP client that does not share the disk.
                    $"/files/{ci.FileId}/preview?channel=rgb",
                    null))
                .ToList(),
            project.EnvironmentMaps
                .Select(e => new ProjectEnvironmentMapBriefDto(e.Id, e.Name))
                .ToList(),
            project.Scenes
                .OrderByDescending(s => s.UpdatedAt)
                .Select(s => new ProjectSceneBriefDto(s.Id, s.Name, s.Revision, s.UpdatedAt))
                .ToList(),
            counts,
            BuildGuidance(project, budget, signals, styles, perspectives, convention));
    }

    public static ProjectSummaryDto Summarize(Project project)
        => new(
            project.Id,
            project.Name,
            project.Description,
            NamesOf(project, ProjectProfileDimensions.Style),
            NamesOf(project, ProjectProfileDimensions.Platform),
            project.MaxTrianglesPerAsset,
            project.Scenes.Count,
            project.Models.Count);

    private static IReadOnlyList<ProjectProfileValueDto> Values(
        IReadOnlyDictionary<string, IReadOnlyList<ProjectProfileValueDto>> byDimension, string dimension)
        => byDimension.TryGetValue(dimension, out var values)
            ? values
            : Array.Empty<ProjectProfileValueDto>();

    private static IReadOnlyList<string> NamesOf(Project project, string dimension)
        => project.ProfileValues
            .Where(v => v.Option is not null
                        && string.Equals(v.Option.Dimension, dimension, StringComparison.OrdinalIgnoreCase))
            .OrderBy(v => v.Option.SortOrder)
            .Select(v => v.Option.Name)
            .ToList();

    private static ProjectBudgetSuggestionDto? BuildSuggestion(IReadOnlyList<ProjectProfileValueDto> platforms)
    {
        var suggestion = PlatformBudgetDefaults.For(platforms.Select(p => p.Name));
        if (suggestion is null) return null;

        return new ProjectBudgetSuggestionDto(
            suggestion.MaxTrianglesPerAsset,
            suggestion.MaxTextureSize,
            suggestion.Platform,
            // Naming the platform matters as much as the number: it is what tells the user
            // that dropping that platform is how the budget goes up.
            // Invariant, like every other agent-facing number in this codebase: a brief
            // that says "5 000" on one machine and "5,000" on another is a brief whose
            // wording depends on where the server happens to run.
            FormattableString.Invariant(
                $"{suggestion.Platform} is the tightest platform selected: {suggestion.MaxTrianglesPerAsset:N0} triangles, {suggestion.MaxTextureSize} px textures."));
    }

    private static ProjectWorldConventionDto BuildConvention(
        Project project, IReadOnlyList<ProjectProfileValueDto> engines)
    {
        var unitsPerMetre = project.UnitsPerMetre ?? EngineConventions.DefaultUnitsPerMetre;
        var upAxis = project.UpAxis ?? EngineConventions.DefaultUpAxis;
        var handedness = project.Handedness ?? EngineConventions.DefaultHandedness;

        var engineNames = engines.Select(e => e.Name).ToList();
        var conversions = EngineConventions.ForAll(engineNames)
            .Select(c => Describe(c, unitsPerMetre, upAxis, handedness))
            .ToList();

        return new ProjectWorldConventionDto(
            unitsPerMetre,
            upAxis,
            handedness,
            IsDefault: project.UnitsPerMetre is null && project.UpAxis is null && project.Handedness is null,
            conversions,
            EngineConventions.Conflicts(engineNames));
    }

    private static string Describe(
        EngineConventions.EngineConvention convention,
        double unitsPerMetre, string upAxis, string handedness)
    {
        var parts = new List<string>();

        var scale = convention.UnitsPerMetre / unitsPerMetre;
        parts.Add(Math.Abs(scale - 1.0) < 0.0001
            ? "×1"
            : FormattableString.Invariant($"×{scale:0.###}"));

        if (!string.Equals(convention.UpAxis, upAxis, StringComparison.OrdinalIgnoreCase))
        {
            parts.Add($"{upAxis}-up → {convention.UpAxis}-up");
        }

        if (!string.Equals(convention.Handedness, handedness, StringComparison.OrdinalIgnoreCase))
        {
            parts.Add("handedness flip");
        }

        return $"{convention.Engine}: {string.Join(", ", parts)}";
    }

    private static ProjectStyleSignalsDto BuildStyleSignals(IReadOnlyList<ProjectProfileValueDto> styles)
    {
        var names = styles.Select(s => s.Name).ToList();
        var merged = ProjectStyleSignals.Merge(names);

        return new ProjectStyleSignalsDto(
            merged.MaxTriangles,
            merged.MaxTextureSize,
            merged.MaxMaterials,
            merged.PreferredUvStatus,
            merged.BoostTokens,
            merged.PenaltyTokens,
            merged.FamilyHint,
            // Named rather than hidden: a style with no reading contributes only its own
            // name, and a caller that cannot see which ones those are will assume the
            // profile is doing more than it is.
            names.Where(n => !ProjectStyleSignals.IsMapped(n)).ToList());
    }

    /// <summary>
    /// The brief in sentences. An agent that reads nothing else should still come away with
    /// the constraints - and the lines are also what the scene editor shows the user, so they
    /// can see exactly what the agent was told.
    /// </summary>
    private static IReadOnlyList<string> BuildGuidance(
        Project project,
        ProjectBudgetDto budget,
        ProjectStyleSignalsDto signals,
        IReadOnlyList<ProjectProfileValueDto> styles,
        IReadOnlyList<ProjectProfileValueDto> perspectives,
        ProjectWorldConventionDto convention)
    {
        var lines = new List<string>();

        if (styles.Count > 0)
        {
            lines.Add($"Style: {string.Join(", ", styles.Select(s => s.Name))}. Prefer assets matching it; an asset that contradicts it can still be proposed, but say so.");
        }

        if (budget.MaxTrianglesPerAsset is int cap)
        {
            lines.Add(FormattableString.Invariant(
                $"Budget: no asset over {cap:N0} triangles. It is a target, not a refusal - going over is a decision to state, not to hide."));
        }
        else if (signals.MaxTriangles is int implied)
        {
            lines.Add(FormattableString.Invariant(
                $"No triangle budget is set. The chosen style usually implies about {implied:N0} triangles per asset; treat that as guidance, not a rule."));
        }

        if (budget.MaxTextureSize is int texture)
        {
            lines.Add(FormattableString.Invariant($"Textures no larger than {texture} px."));
        }

        if (budget.TargetSceneTriangles is int sceneCap)
        {
            lines.Add(FormattableString.Invariant($"Whole-scene target: {sceneCap:N0} triangles."));
        }

        if (signals.FamilyHint is not null)
        {
            lines.Add($"This project's style implies {signals.FamilyHint} assets. Search that family first.");
        }

        if (perspectives.Count > 0)
        {
            lines.Add($"Camera: {string.Join(", ", perspectives.Select(p => p.Name))}. Detail that is never on screen is not worth spending budget on.");
        }

        if (budget.PixelsPerUnit is int ppu)
        {
            // Say the limit out loud rather than implying a check that does not run.
            lines.Add(FormattableString.Invariant(
                $"Pixels per unit: {ppu}. Nothing extracts a sprite's pixel size yet, so this cannot be checked automatically - match it by eye."));
        }

        if (project.PaletteHex.Count > 0)
        {
            lines.Add($"Palette: {string.Join(", ", project.PaletteHex)}.");
        }

        if (convention.Conflicts.Count > 0)
        {
            lines.Add(
                "The selected engines disagree - " + string.Join("; ", convention.Conflicts) +
                ". An asset has to work in all of them, so state which convention you authored against.");
        }

        if (project.EnvironmentMaps.Count > 0)
        {
            lines.Add($"This project has {project.EnvironmentMaps.Count} environment map(s) of its own. Light a scene with one of them rather than inventing an HDRI - they are the project's chosen look.");
        }

        if (signals.UnmappedStyles.Count > 0)
        {
            lines.Add($"No built-in reading exists for {string.Join(", ", signals.UnmappedStyles)}; only the name itself is used as a search signal.");
        }

        return lines;
    }
}
