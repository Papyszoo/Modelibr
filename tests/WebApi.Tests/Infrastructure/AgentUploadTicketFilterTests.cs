using Application.Abstractions.Services;
using Application.Agents;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Moq;
using WebApi.Infrastructure;
using Xunit;

namespace WebApi.Tests.Infrastructure;

/// <summary>
/// The upload ticket's binding to the endpoint it may be spent at.
///
/// AgentUploadTicket promises "one upload, one family", and this filter is the only thing
/// that enforces it. Unenforced, a Sound ticket presented on POST /models recorded the new
/// model's id as a Sound operation - and undoing that entry recycled whatever sound happened
/// to carry the same number. A delete of an unrelated asset is not a mislabelled audit row,
/// so the mismatch has to be refused rather than recorded.
/// </summary>
public class AgentUploadTicketFilterTests
{
    private const string Secret = "ticket-secret";

    private static (EndpointFilterInvocationContext Context, Mock<IAgentUploadTickets> Tickets, Mock<IAgentAudit> Audit)
        Request(string ticketFamily)
    {
        var tickets = new Mock<IAgentUploadTickets>();
        tickets.Setup(t => t.TryRedeemAsync(Secret, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new RedeemedUploadTicket(
                TicketId: 5,
                IdempotencyKey: "key-1",
                Operation: $"import-{ticketFamily.ToLowerInvariant()}",
                AssetType: ticketFamily,
                Actor: "curator",
                BatchId: null));

        var audit = new Mock<IAgentAudit>();
        audit.Setup(a => a.TryBeginAsync(It.IsAny<AgentWrite>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AgentClaim(AgentClaimOutcome.Owned, null, "gen-1"));
        audit.Setup(a => a.CompleteAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<int?>(),
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
        audit.Setup(a => a.AbandonAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

        var services = new ServiceCollection();
        services.AddSingleton(tickets.Object);
        services.AddSingleton(audit.Object);

        var http = new DefaultHttpContext { RequestServices = services.BuildServiceProvider() };
        http.Request.Headers[AgentUploadTicketFilter.TicketHeader] = Secret;

        return (EndpointFilterInvocationContext.Create(http), tickets, audit);
    }

    [Fact]
    public async Task A_Ticket_For_Another_Family_Is_Refused_And_Handed_Back()
    {
        var (context, tickets, audit) = Request(AgentAssetFamilies.Sound);
        var filter = new AgentUploadTicketFilter(AgentAssetFamilies.Model);
        var reachedEndpoint = false;

        var result = await filter.InvokeAsync(context, _ =>
        {
            reachedEndpoint = true;
            return ValueTask.FromResult<object?>(Results.Ok());
        });

        Assert.False(reachedEndpoint);
        Assert.Equal(StatusCodes.Status409Conflict, Assert.IsAssignableFrom<IStatusCodeHttpResult>(result).StatusCode);

        // Never claimed: the agent's key must still be spendable at the right endpoint, and
        // the ticket goes back in the pool rather than being burned on a rejected request.
        audit.Verify(a => a.TryBeginAsync(It.IsAny<AgentWrite>(), It.IsAny<CancellationToken>()), Times.Never);
        tickets.Verify(t => t.SettleAsync(5, false, null, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task A_Ticket_For_This_Family_Reaches_The_Endpoint_And_Is_Audited()
    {
        var (context, _, audit) = Request(AgentAssetFamilies.Model);
        var filter = new AgentUploadTicketFilter(AgentAssetFamilies.Model);

        await filter.InvokeAsync(context, _ => ValueTask.FromResult<object?>(Results.Ok(new { Id = 7 })));

        audit.Verify(
            a => a.TryBeginAsync(It.Is<AgentWrite>(w => w.AssetType == AgentAssetFamilies.Model), It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task A_Request_Without_A_Ticket_Header_Is_Untouched()
    {
        // The UI and anyone using the API directly must not notice this filter exists.
        var http = new DefaultHttpContext { RequestServices = new ServiceCollection().BuildServiceProvider() };
        var filter = new AgentUploadTicketFilter(AgentAssetFamilies.Model);
        var reachedEndpoint = false;

        await filter.InvokeAsync(EndpointFilterInvocationContext.Create(http), _ =>
        {
            reachedEndpoint = true;
            return ValueTask.FromResult<object?>(Results.Ok());
        });

        Assert.True(reachedEndpoint);
    }
}
