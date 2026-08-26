namespace Application.Projects.Profile;

public sealed record ProjectProfileOptionDto(
    int Id,
    string Dimension,
    string Name,
    bool IsBuiltIn,
    bool IsHidden,
    int SortOrder);

/// <param name="Role">
/// Only meaningful on the engine dimension: which engine is for authoring and which for
/// runtime is what tells an agent what format to hand back.
/// </param>
public sealed record ProjectProfileValueDto(int OptionId, string Name, string? Role);

/// <summary>The fidelity budget, as stored. Every field null means unconstrained.</summary>
public sealed record ProjectBudgetDto(
    int? MaxTrianglesPerAsset,
    int? MaxTextureSize,
    int? TargetSceneTriangles,
    int? PixelsPerUnit);

/// <param name="Platform">Which selected platform the numbers come from.</param>
/// <param name="Note">A sentence naming the platform, for a UI hint or a brief line.</param>
public sealed record ProjectBudgetSuggestionDto(
    int MaxTrianglesPerAsset,
    int MaxTextureSize,
    string Platform,
    string Note);

/// <summary>
/// The project's authored world convention, plus what it converts to in each selected engine.
/// </summary>
/// <param name="EngineConversions">
/// One line per selected engine we know the convention for. Facts, not choices - and an
/// engine we do not know contributes no line rather than a guessed one.
/// </param>
/// <param name="Conflicts">
/// Where the selected engines disagree with each other. Stated, never resolved: "works in
/// both" is a constraint the agent has to see, and one it cannot satisfy without knowing.
/// </param>
public sealed record ProjectWorldConventionDto(
    double UnitsPerMetre,
    string UpAxis,
    string Handedness,
    bool IsDefault,
    IReadOnlyList<string> EngineConversions,
    IReadOnlyList<string> Conflicts);

/// <summary>
/// What the project's styles mean in terms search can act on. Empty lists rather than nulls:
/// "this style implies no cap" and "we have no reading of this style" both mean the same
/// thing to a caller - no constraint.
/// </summary>
public sealed record ProjectStyleSignalsDto(
    int? MaxTriangles,
    int? MaxTextureSize,
    int? MaxMaterials,
    string? PreferredUvStatus,
    IReadOnlyList<string> BoostTokens,
    IReadOnlyList<string> PenaltyTokens,
    string? FamilyHint,
    IReadOnlyList<string> UnmappedStyles);

public sealed record ProjectConceptImageBriefDto(int FileId, string FileName, string Url, string? Caption);

public sealed record ProjectEnvironmentMapBriefDto(int Id, string Name);

public sealed record ProjectSceneBriefDto(int Id, string Name, int Revision, DateTime UpdatedAt);

/// <summary>
/// Everything an agent is given about a project (prompt 13-D1) - the brief.
///
/// <para>
/// Assembled rather than stored: the budget suggestion, the engine conversions and the style
/// signals are all readings of the stored profile, and a reading that was persisted would go
/// stale the moment the mapping behind it was corrected.
/// </para>
/// </summary>
/// <param name="Guidance">
/// Plain-language lines an agent can act on without reading the structured fields - what the
/// profile actually asks of an asset choice.
/// </param>
public sealed record ProjectBriefDto(
    int Id,
    string Name,
    string? Description,
    string? Notes,
    IReadOnlyList<ProjectProfileValueDto> Engines,
    IReadOnlyList<ProjectProfileValueDto> Platforms,
    IReadOnlyList<ProjectProfileValueDto> Genres,
    IReadOnlyList<ProjectProfileValueDto> Styles,
    IReadOnlyList<ProjectProfileValueDto> Perspectives,
    ProjectBudgetDto Budget,
    ProjectBudgetSuggestionDto? BudgetSuggestion,
    ProjectWorldConventionDto WorldConvention,
    ProjectStyleSignalsDto StyleSignals,
    IReadOnlyList<string> PaletteHex,
    IReadOnlyList<ProjectConceptImageBriefDto> ConceptImages,
    IReadOnlyList<ProjectEnvironmentMapBriefDto> EnvironmentMaps,
    IReadOnlyList<ProjectSceneBriefDto> Scenes,
    ProjectAssetCountsDto AssetCounts,
    IReadOnlyList<string> Guidance);

public sealed record ProjectAssetCountsDto(
    int Models,
    int TextureSets,
    int Sprites,
    int Sounds,
    int Scripts,
    int EnvironmentMaps,
    int Scenes);

/// <summary>One line per project, for a list.</summary>
public sealed record ProjectSummaryDto(
    int Id,
    string Name,
    string? Description,
    IReadOnlyList<string> Styles,
    IReadOnlyList<string> Platforms,
    int? MaxTrianglesPerAsset,
    int SceneCount,
    int ModelCount);
