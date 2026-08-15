using System.Security.Cryptography;
using System.Text;
using Application.Abstractions;
using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Domain.Models;
using Domain.Services;

namespace Infrastructure.Services;

/// <summary>
/// Issues and redeems agent upload tickets.
///
/// This service commits its own writes through <see cref="IUnitOfWork"/> because its
/// callers have no command handler to commit for them: a ticket is issued from an MCP tool
/// and redeemed from an endpoint filter, both outside the command pipeline. A ticket that
/// is only staged is a ticket the agent is told to use and the next request cannot find.
/// </summary>
internal sealed class AgentUploadTickets : IAgentUploadTickets
{
    private readonly IAgentUploadTicketRepository _repository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IUnitOfWork _unitOfWork;

    public AgentUploadTickets(
        IAgentUploadTicketRepository repository,
        IDateTimeProvider dateTimeProvider,
        IUnitOfWork unitOfWork)
    {
        _repository = repository;
        _dateTimeProvider = dateTimeProvider;
        _unitOfWork = unitOfWork;
    }

    public async Task<AgentUploadTicketGrant> IssueAsync(
        string idempotencyKey,
        string operation,
        string assetType,
        string? actor = null,
        string? batchId = null,
        CancellationToken cancellationToken = default)
    {
        var now = _dateTimeProvider.UtcNow;
        var secret = GenerateSecret();
        var expiresAt = now.AddMinutes(AgentUploadTicket.LifetimeMinutes);

        var ticket = AgentUploadTicket.Create(
            Hash(secret), idempotencyKey, operation, assetType, now, expiresAt, actor, batchId);

        await _repository.AddAsync(ticket, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return new AgentUploadTicketGrant(secret, idempotencyKey, expiresAt);
    }

    public async Task<RedeemedUploadTicket?> TryRedeemAsync(
        string presentedSecret,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(presentedSecret))
        {
            return null;
        }

        var ticket = await _repository.TryRedeemAsync(
            Hash(presentedSecret), _dateTimeProvider.UtcNow, cancellationToken);

        // The repository's conditional update is the commit for the redemption itself
        // (ExecuteUpdate writes through), so there is nothing staged to save here.
        return ticket is null
            ? null
            : new RedeemedUploadTicket(
                ticket.Id, ticket.IdempotencyKey, ticket.Operation, ticket.AssetType, ticket.Actor, ticket.BatchId);
    }

    public Task SettleAsync(
        int ticketId,
        bool succeeded,
        int? assetId = null,
        CancellationToken cancellationToken = default) =>
        succeeded
            ? _repository.SpendAsync(ticketId, assetId, cancellationToken)
            : _repository.ReleaseAsync(ticketId, cancellationToken);

    /// <summary>256 bits of CSPRNG entropy, URL-safe so it survives a header or a query string.</summary>
    private static string GenerateSecret() =>
        Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))
            .Replace('+', '-')
            .Replace('/', '_')
            .TrimEnd('=');

    private static string Hash(string secret) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(secret)));
}
