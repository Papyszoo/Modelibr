using System.Net;
using System.Text.Json;
using Application.Abstractions.Services;
using Application.StoreCatalog;
using Application.StoreImports;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using SharedKernel;

namespace Infrastructure.Services;

/// <summary>
/// Reads the companion Asset Store's public catalog (v0.6 prompt 15, part A).
///
/// Deliberately much thinner than <see cref="StoreImportClient"/>: it sends no credential,
/// follows no redirect by hand, and writes no file, because every endpoint it touches is
/// anonymous and returns small JSON. What it does share is the store URL validation - the
/// configured store is operator-supplied and still must not be an arbitrary internal
/// address, so it goes through the same <see cref="StoreUrlSafety"/> gate the importer uses.
///
/// The store is optional infrastructure. Every failure here is reported as a Result the
/// agent can act on, never as an exception, and nothing in the local library depends on it.
/// </summary>
internal sealed class StoreCatalogClient : IStoreCatalogClient
{
    public const string HttpClientName = "StoreCatalog";

    private static readonly JsonSerializerOptions CatalogJsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<StoreCatalogClient> _logger;

    public StoreCatalogClient(
        IHttpClientFactory httpClientFactory,
        IConfiguration configuration,
        ILogger<StoreCatalogClient> logger)
    {
        _httpClientFactory = httpClientFactory;
        _logger = logger;

        var configured = configuration.GetValue<string?>("STORE_URL");
        StoreUrl = string.IsNullOrWhiteSpace(configured)
            ? null
            : configured.Trim().TrimEnd('/');
    }

    public string? StoreUrl { get; }

    public async Task<Result<StoreCatalogPage>> SearchAsync(
        StoreCatalogQuery query,
        CancellationToken cancellationToken)
    {
        var baseUrl = ValidatedBaseUrl();
        if (baseUrl.IsFailure)
        {
            return Result.Failure<StoreCatalogPage>(baseUrl.Error);
        }

        var parameters = new List<string>
        {
            $"page={query.Page}",
            $"pageSize={query.PageSize}"
        };
        AddIfPresent(parameters, "search", query.Search);
        AddIfPresent(parameters, "itemType", query.ItemType);
        AddIfPresent(parameters, "tag", query.Tag);
        AddIfPresent(parameters, "format", query.Format);

        var response = await GetJsonAsync<StoreAssetsPageDto>(
            baseUrl.Value, $"/api/assets?{string.Join('&', parameters)}", cancellationToken);
        if (response.IsFailure)
        {
            return Result.Failure<StoreCatalogPage>(response.Error);
        }

        var page = response.Value;
        var assets = (page.Items ?? new List<StoreAssetDto>())
            .Select(item => MapSummary(item, baseUrl.Value))
            // The store has no "free only" filter of its own, so it is applied here rather
            // than left to the agent: a paid asset cannot be acquired from this side at all,
            // and offering one as though it could be is the more expensive mistake.
            .Where(asset => !query.FreeOnly || asset.IsFree)
            .ToList();

        return Result.Success(new StoreCatalogPage(
            assets,
            page.TotalCount,
            page.Page == 0 ? query.Page : page.Page,
            page.PageSize == 0 ? query.PageSize : page.PageSize));
    }

    public async Task<Result<StoreCatalogAsset>> GetAssetAsync(
        string storeAssetId,
        CancellationToken cancellationToken)
    {
        var baseUrl = ValidatedBaseUrl();
        if (baseUrl.IsFailure)
        {
            return Result.Failure<StoreCatalogAsset>(baseUrl.Error);
        }

        if (!Guid.TryParse(storeAssetId, out var assetId))
        {
            return Result.Failure<StoreCatalogAsset>(StoreCatalogErrors.AssetNotFound(storeAssetId));
        }

        var response = await GetJsonAsync<StoreAssetDto>(
            baseUrl.Value, $"/api/assets/{assetId}", cancellationToken);
        if (response.IsFailure)
        {
            return Result.Failure<StoreCatalogAsset>(response.Error);
        }

        var dto = response.Value;
        var summary = MapSummary(dto, baseUrl.Value);

        return Result.Success(summary with
        {
            License = string.IsNullOrWhiteSpace(dto.License) ? null : dto.License,
            Items = (dto.Items ?? new List<StoreAssetItemDto>())
                .Select(item => new StoreCatalogItem(
                    item.Id.ToString(),
                    NullIfBlank(item.Name),
                    NullIfBlank(item.ItemType),
                    NullIfBlank(item.Category),
                    NullIfBlank(item.Subcategory),
                    item.IsPreviewable))
                .ToList(),
            Previews = (dto.Previews ?? new List<StoreAssetPreviewDto>())
                .Select(preview => new StoreCatalogPreview(
                    preview.Id.ToString(),
                    NullIfBlank(preview.Type),
                    Absolute(preview.Url, baseUrl.Value) ?? preview.Url,
                    preview.PackItemId?.ToString()))
                .ToList()
        });
    }

    private Result<Uri> ValidatedBaseUrl()
    {
        if (string.IsNullOrWhiteSpace(StoreUrl))
        {
            return Result.Failure<Uri>(StoreCatalogErrors.NotConfigured);
        }

        var validation = StoreUrlSafety.ValidateStoreBaseUrl(StoreUrl);
        if (validation.IsFailure || !Uri.TryCreate(StoreUrl, UriKind.Absolute, out var uri))
        {
            return Result.Failure<Uri>(StoreCatalogErrors.InvalidStoreUrl);
        }

        return Result.Success(uri);
    }

    private async Task<Result<T>> GetJsonAsync<T>(
        Uri baseUrl,
        string relativePath,
        CancellationToken cancellationToken)
    {
        var requestUri = new Uri(baseUrl, relativePath);

        try
        {
            var client = _httpClientFactory.CreateClient(HttpClientName);
            using var response = await client.GetAsync(requestUri, cancellationToken);

            if (response.StatusCode == HttpStatusCode.NotFound)
            {
                return Result.Failure<T>(StoreCatalogErrors.AssetNotFound(requestUri.AbsolutePath));
            }

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning(
                    "Store catalog request to {Path} returned {StatusCode}.",
                    requestUri.AbsolutePath, (int)response.StatusCode);
                return Result.Failure<T>(StoreCatalogErrors.Unreachable(baseUrl.ToString()));
            }

            await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
            var payload = await JsonSerializer.DeserializeAsync<T>(
                stream, CatalogJsonOptions, cancellationToken);

            return payload is null
                ? Result.Failure<T>(StoreCatalogErrors.Unreachable(baseUrl.ToString()))
                : Result.Success(payload);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException)
        {
            // A store that is down, slow or speaking a shape this build does not understand is
            // the same answer to the caller: carry on from the local library.
            _logger.LogWarning(ex, "Store catalog request to {Path} failed.", requestUri.AbsolutePath);
            return Result.Failure<T>(StoreCatalogErrors.Unreachable(baseUrl.ToString()));
        }
    }

    private static StoreCatalogAsset MapSummary(StoreAssetDto dto, Uri baseUrl) => new(
        dto.Id.ToString(),
        dto.Title ?? string.Empty,
        NullIfBlank(dto.Description),
        NullIfBlank(dto.Author),
        dto.Price,
        NullIfBlank(dto.Currency),
        dto.Price == 0m,
        dto.ItemTypes ?? new List<string>(),
        dto.Formats ?? new List<string>(),
        dto.Tags ?? new List<string>(),
        dto.ItemCount,
        dto.FileSize,
        Absolute(dto.ThumbnailUrl, baseUrl),
        AlreadyImported: false,
        CreditName: NullIfBlank(dto.CreditName),
        MatchedItems: dto.MatchedItems?
            .Select(i => new StoreCatalogMatchedItem(
                i.Id.ToString(), NullIfBlank(i.Name), NullIfBlank(i.ItemType)))
            .ToList(),
        // Tied to MatchedItems so the pair is never half-answered.
        MatchedItemCount: dto.MatchedItems is null ? null : dto.MatchedItemCount);

    private static void AddIfPresent(List<string> parameters, string name, string? value)
    {
        if (!string.IsNullOrWhiteSpace(value))
        {
            parameters.Add($"{name}={Uri.EscapeDataString(value.Trim())}");
        }
    }

    private static string? NullIfBlank(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value;

    /// <summary>
    /// The store returns absolute URLs when <c>Store:PublicBaseUrl</c> is set and relative
    /// ones otherwise, so both are resolved against the configured store rather than handed
    /// to the agent as-is - a relative path is useless to anything outside the store's own SPA.
    /// </summary>
    private static string? Absolute(string? url, Uri baseUrl)
    {
        if (string.IsNullOrWhiteSpace(url))
        {
            return null;
        }

        return Uri.TryCreate(baseUrl, url, out var absolute) ? absolute.ToString() : null;
    }

    private sealed record StoreAssetsPageDto(
        List<StoreAssetDto>? Items,
        int Page,
        int PageSize,
        int TotalCount,
        int TotalPages);

    private sealed record StoreAssetDto(
        Guid Id,
        string? Title,
        string? Description,
        string? Author,
        string? ThumbnailUrl,
        List<string>? ItemTypes,
        List<string>? Formats,
        long FileSize,
        bool IsPack,
        int ItemCount,
        int DownloadCount,
        List<string>? Tags,
        decimal Price,
        string? Currency,
        string? CreditName,
        string? CreditUrl,
        string? License,
        List<StoreAssetItemDto>? Items,
        List<StoreAssetPreviewDto>? Previews,
        // Sent only by a store that searches inside packs. An older deployment omits both,
        // which deserializes to null/0 and is reported as "not answered" rather than "no
        // items matched" - the two mean opposite things to an agent choosing what to import.
        List<StoreMatchedItemDto>? MatchedItems,
        int MatchedItemCount);

    private sealed record StoreMatchedItemDto(
        Guid Id,
        string? Name,
        string? ItemType);

    private sealed record StoreAssetItemDto(
        Guid Id,
        string? ItemType,
        string? Name,
        bool IsPreviewable,
        string? Category,
        string? Subcategory);

    private sealed record StoreAssetPreviewDto(
        Guid Id,
        string? Type,
        string? Url,
        string? FileName,
        Guid? PackItemId);
}
