namespace Domain.Models;

/// <summary>
/// Represents a 3D scene environment configuration for model preview.
/// Includes lighting, camera position, environment maps, and optional custom models.
/// </summary>
public class Environment : AggregateRoot
{
    public int Id { get; set; }
    public string Name { get; private set; } = string.Empty;
    public string? Description { get; private set; }
    public bool IsDefault { get; private set; }
    
    // Lighting settings
    public double LightIntensity { get; private set; }
    
    // Environment map settings
    public string EnvironmentPreset { get; private set; } = string.Empty;
    
    // Shadow settings
    public bool ShowShadows { get; private set; }
    public string? ShadowType { get; private set; }
    public double ShadowOpacity { get; private set; }
    public double ShadowBlur { get; private set; }
    
    // Camera settings
    public bool AutoAdjustCamera { get; private set; }
    public double? CameraDistance { get; private set; }
    public double? CameraAngle { get; private set; }
    
    // Optional custom background model (for complex environments)
    public int? BackgroundModelId { get; private set; }
    
    public DateTime CreatedAt { get; private set; }
    public DateTime UpdatedAt { get; private set; }

    // Private constructor for EF Core
    private Environment() { }

    /// <summary>
    /// Creates a new environment configuration.
    /// </summary>
    public static Environment Create(
        string name,
        double lightIntensity,
        string environmentPreset,
        bool showShadows,
        DateTime createdAt,
        bool isDefault = false,
        string? description = null)
    {
        ValidateName(name);
        ValidateLightIntensity(lightIntensity);
        ValidateEnvironmentPreset(environmentPreset);

        return new Environment
        {
            Name = name,
            Description = description,
            IsDefault = isDefault,
            LightIntensity = lightIntensity,
            EnvironmentPreset = environmentPreset,
            ShowShadows = showShadows,
            ShadowType = showShadows ? "contact" : null,
            ShadowOpacity = 0.4,
            ShadowBlur = 2,
            AutoAdjustCamera = false,
            CreatedAt = createdAt,
            UpdatedAt = createdAt
        };
    }

    /// <summary>
    /// Creates the default "Stage" environment based on current implementation.
    /// </summary>
    public static Environment CreateDefaultStage(DateTime createdAt)
    {
        return new Environment
        {
            Name = "Stage",
            Description = "Default stage environment with city lighting",
            IsDefault = true,
            LightIntensity = 0.5,
            EnvironmentPreset = "city",
            ShowShadows = true,
            ShadowType = "contact",
            ShadowOpacity = 0.4,
            ShadowBlur = 2,
            AutoAdjustCamera = false,
            CreatedAt = createdAt,
            UpdatedAt = createdAt
        };
    }

    public void UpdateName(string name, DateTime updatedAt)
    {
        ValidateName(name);
        Name = name;
        UpdatedAt = updatedAt;
    }

    public void UpdateDescription(string? description, DateTime updatedAt)
    {
        Description = description;
        UpdatedAt = updatedAt;
    }

    public void UpdateLightingSettings(
        double lightIntensity,
        string environmentPreset,
        DateTime updatedAt)
    {
        ValidateLightIntensity(lightIntensity);
        ValidateEnvironmentPreset(environmentPreset);
        
        LightIntensity = lightIntensity;
        EnvironmentPreset = environmentPreset;
        UpdatedAt = updatedAt;
    }

    public void UpdateShadowSettings(
        bool showShadows,
        string? shadowType,
        double shadowOpacity,
        double shadowBlur,
        DateTime updatedAt)
    {
        if (showShadows && string.IsNullOrWhiteSpace(shadowType))
            throw new ArgumentException("Shadow type is required when shadows are enabled.", nameof(shadowType));

        ValidateShadowOpacity(shadowOpacity);
        ValidateShadowBlur(shadowBlur);
        
        ShowShadows = showShadows;
        ShadowType = showShadows ? shadowType : null;
        ShadowOpacity = shadowOpacity;
        ShadowBlur = shadowBlur;
        UpdatedAt = updatedAt;
    }

    public void UpdateCameraSettings(
        bool autoAdjustCamera,
        double? cameraDistance,
        double? cameraAngle,
        DateTime updatedAt)
    {
        if (!autoAdjustCamera && cameraDistance.HasValue)
            ValidateCameraDistance(cameraDistance.Value);
        
        AutoAdjustCamera = autoAdjustCamera;
        CameraDistance = autoAdjustCamera ? null : cameraDistance;
        CameraAngle = autoAdjustCamera ? null : cameraAngle;
        UpdatedAt = updatedAt;
    }

    public void SetAsDefault(DateTime updatedAt)
    {
        IsDefault = true;
        UpdatedAt = updatedAt;
    }

    public void UnsetAsDefault(DateTime updatedAt)
    {
        IsDefault = false;
        UpdatedAt = updatedAt;
    }

    public void SetBackgroundModel(int? modelId, DateTime updatedAt)
    {
        BackgroundModelId = modelId;
        UpdatedAt = updatedAt;
    }

    private static void ValidateName(string name)
    {
        if (string.IsNullOrWhiteSpace(name))
            throw new ArgumentException("Environment name cannot be null or empty.", nameof(name));

        if (name.Length > 100)
            throw new ArgumentException("Environment name cannot exceed 100 characters.", nameof(name));
    }

    private static void ValidateLightIntensity(double intensity)
    {
        if (intensity < 0 || intensity > 10)
            throw new ArgumentException("Light intensity must be between 0 and 10.", nameof(intensity));
    }

    private static void ValidateEnvironmentPreset(string preset)
    {
        if (string.IsNullOrWhiteSpace(preset))
            throw new ArgumentException("Environment preset cannot be null or empty.", nameof(preset));

        var validPresets = new[] { "city", "dawn", "forest", "lobby", "night", "park", "studio", "sunset", "warehouse" };
        if (!validPresets.Contains(preset.ToLowerInvariant()))
            throw new ArgumentException($"Environment preset must be one of: {string.Join(", ", validPresets)}.", nameof(preset));
    }

    private static void ValidateShadowOpacity(double opacity)
    {
        if (opacity < 0 || opacity > 1)
            throw new ArgumentException("Shadow opacity must be between 0 and 1.", nameof(opacity));
    }

    private static void ValidateShadowBlur(double blur)
    {
        if (blur < 0 || blur > 10)
            throw new ArgumentException("Shadow blur must be between 0 and 10.", nameof(blur));
    }

    private static void ValidateCameraDistance(double distance)
    {
        if (distance <= 0)
            throw new ArgumentException("Camera distance must be greater than 0.", nameof(distance));
    }
}
