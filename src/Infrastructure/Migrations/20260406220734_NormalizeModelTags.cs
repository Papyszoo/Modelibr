using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class NormalizeModelTags : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ModelTags",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    NormalizedName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ModelTags", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ModelTagAssignments",
                columns: table => new
                {
                    ModelId = table.Column<int>(type: "integer", nullable: false),
                    ModelTagId = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ModelTagAssignments", x => new { x.ModelId, x.ModelTagId });
                    table.ForeignKey(
                        name: "FK_ModelTagAssignments_ModelTags_ModelTagId",
                        column: x => x.ModelTagId,
                        principalTable: "ModelTags",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ModelTagAssignments_Models_ModelId",
                        column: x => x.ModelId,
                        principalTable: "Models",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ModelTagAssignments_ModelTagId",
                table: "ModelTagAssignments",
                column: "ModelTagId");

            migrationBuilder.CreateIndex(
                name: "IX_ModelTags_NormalizedName",
                table: "ModelTags",
                column: "NormalizedName",
                unique: true);

            migrationBuilder.Sql(@"
                INSERT INTO ""ModelTags"" (""Name"", ""NormalizedName"", ""CreatedAt"", ""UpdatedAt"")
                SELECT DISTINCT split.trimmed_tag,
                                lower(split.trimmed_tag),
                                NOW(),
                                NOW()
                FROM ""Models"" AS m
                CROSS JOIN LATERAL (
                    SELECT btrim(value) AS trimmed_tag
                    FROM regexp_split_to_table(COALESCE(m.""Tags"", ''), ',') AS value
                ) AS split
                WHERE split.trimmed_tag <> ''
                ON CONFLICT (""NormalizedName"") DO NOTHING;
            ");

            migrationBuilder.Sql(@"
                INSERT INTO ""ModelTagAssignments"" (""ModelId"", ""ModelTagId"")
                SELECT m.""Id"", mt.""Id""
                FROM ""Models"" AS m
                CROSS JOIN LATERAL (
                    SELECT DISTINCT btrim(value) AS trimmed_tag
                    FROM regexp_split_to_table(COALESCE(m.""Tags"", ''), ',') AS value
                ) AS split
                INNER JOIN ""ModelTags"" AS mt
                    ON mt.""NormalizedName"" = lower(split.trimmed_tag)
                WHERE split.trimmed_tag <> ''
                ON CONFLICT DO NOTHING;
            ");

            migrationBuilder.DropColumn(
                name: "Tags",
                table: "Models");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Tags",
                table: "Models",
                type: "text",
                nullable: true);

            migrationBuilder.Sql(@"
                UPDATE ""Models"" AS m
                SET ""Tags"" = assignment.tags
                FROM (
                    SELECT mta.""ModelId"",
                           string_agg(mt.""Name"", ', ' ORDER BY mt.""Name"") AS tags
                    FROM ""ModelTagAssignments"" AS mta
                    INNER JOIN ""ModelTags"" AS mt ON mt.""Id"" = mta.""ModelTagId""
                    GROUP BY mta.""ModelId""
                ) AS assignment
                WHERE m.""Id"" = assignment.""ModelId"";
            ");

            migrationBuilder.DropTable(
                name: "ModelTagAssignments");

            migrationBuilder.DropTable(
                name: "ModelTags");
        }
    }
}
