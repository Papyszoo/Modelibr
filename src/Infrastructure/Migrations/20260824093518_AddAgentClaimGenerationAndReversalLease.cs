using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <summary>
    /// Splits two facts the agent operation log used to conflate, and gives every claim a
    /// generation.
    ///
    /// <list type="bullet">
    /// <item><c>ClaimToken</c> - which generation of a claim a caller holds. Settling by
    /// idempotency key alone let a caller whose lease had lapsed stamp its outcome onto the
    /// claim that replaced it.</item>
    /// <item><c>ReversalToken</c> / <c>ReversalClaimedAt</c> - a reversal that is
    /// <i>in progress</i>. <c>ReversedAt</c> was doing both jobs: it was stamped before the
    /// inverse ran, so an inverse that was cancelled, threw, or died with its process left
    /// an operation permanently recorded as undone that was never undone.</item>
    /// </list>
    ///
    /// Additive and backward compatible: an older build simply ignores the three columns.
    /// The one direction that needs care is rolling BACK with the API running - Down maps
    /// the new Interrupted status onto Failed, which an older build understands but treats
    /// as retryable.
    /// </summary>
    public partial class AddAgentClaimGenerationAndReversalLease : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ClaimToken",
                table: "AgentOperationLogs",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<DateTime>(
                name: "ReversalClaimedAt",
                table: "AgentOperationLogs",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ReversalToken",
                table: "AgentOperationLogs",
                type: "character varying(32)",
                maxLength: 32,
                nullable: true);

            // Every existing row gets its own generation. The column default is '', and
            // leaving them all at '' would make one stale token match every legacy row.
            migrationBuilder.Sql("""
                UPDATE "AgentOperationLogs"
                SET "ClaimToken" = replace(gen_random_uuid()::text, '-', '')
                WHERE "ClaimToken" = '';
                """);

            // A Pending claim cannot survive an upgrade honestly. The process that held it
            // is gone - this migration runs at startup - and whether its mutation committed
            // before it died is exactly what nothing recorded. That is the definition of
            // Interrupted, and leaving them Pending only reaches the same place one lease
            // later, via a path that used to hand the key to a retry.
            migrationBuilder.Sql("""
                UPDATE "AgentOperationLogs"
                SET "Status" = 'Interrupted',
                    "CompletedAt" = COALESCE("CompletedAt", now() AT TIME ZONE 'utc'),
                    "ClaimedBy" = NULL
                WHERE "Status" = 'Pending';
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Interrupted is not a status an older build knows. Rolling back maps it to
            // Failed - that build's nearest equivalent, and the reason a rollback through
            // this migration should be done with the API stopped.
            migrationBuilder.Sql("""
                UPDATE "AgentOperationLogs"
                SET "Status" = 'Failed'
                WHERE "Status" = 'Interrupted';
                """);

            migrationBuilder.DropColumn(
                name: "ClaimToken",
                table: "AgentOperationLogs");

            migrationBuilder.DropColumn(
                name: "ReversalClaimedAt",
                table: "AgentOperationLogs");

            migrationBuilder.DropColumn(
                name: "ReversalToken",
                table: "AgentOperationLogs");
        }
    }
}
