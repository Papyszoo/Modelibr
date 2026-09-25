using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddProjectReferenceLinks : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ProjectReferenceLinks",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ProjectId = table.Column<int>(type: "integer", nullable: false),
                    ProjectConceptImageId = table.Column<int>(type: "integer", nullable: false),
                    ProjectLevelId = table.Column<int>(type: "integer", nullable: true),
                    ProjectCharacterId = table.Column<int>(type: "integer", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProjectReferenceLinks", x => x.Id);
                    table.CheckConstraint("CK_ProjectReferenceLinks_OneTarget", "(CASE WHEN \"ProjectLevelId\" IS NOT NULL THEN 1 ELSE 0 END) + (CASE WHEN \"ProjectCharacterId\" IS NOT NULL THEN 1 ELSE 0 END) = 1");
                    table.ForeignKey(
                        name: "FK_ProjectReferenceLinks_ProjectCharacters_ProjectCharacterId",
                        column: x => x.ProjectCharacterId,
                        principalTable: "ProjectCharacters",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_ProjectReferenceLinks_ProjectConceptImages_ProjectConceptIm~",
                        column: x => x.ProjectConceptImageId,
                        principalTable: "ProjectConceptImages",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ProjectReferenceLinks_ProjectLevels_ProjectLevelId",
                        column: x => x.ProjectLevelId,
                        principalTable: "ProjectLevels",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ProjectReferenceLinks_ProjectCharacterId",
                table: "ProjectReferenceLinks",
                column: "ProjectCharacterId");

            migrationBuilder.CreateIndex(
                name: "IX_ProjectReferenceLinks_ProjectConceptImageId_ProjectCharacte~",
                table: "ProjectReferenceLinks",
                columns: new[] { "ProjectConceptImageId", "ProjectCharacterId" },
                unique: true,
                filter: "\"ProjectCharacterId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_ProjectReferenceLinks_ProjectConceptImageId_ProjectLevelId",
                table: "ProjectReferenceLinks",
                columns: new[] { "ProjectConceptImageId", "ProjectLevelId" },
                unique: true,
                filter: "\"ProjectLevelId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_ProjectReferenceLinks_ProjectId_ProjectCharacterId",
                table: "ProjectReferenceLinks",
                columns: new[] { "ProjectId", "ProjectCharacterId" });

            migrationBuilder.CreateIndex(
                name: "IX_ProjectReferenceLinks_ProjectId_ProjectLevelId",
                table: "ProjectReferenceLinks",
                columns: new[] { "ProjectId", "ProjectLevelId" });

            migrationBuilder.CreateIndex(
                name: "IX_ProjectReferenceLinks_ProjectLevelId",
                table: "ProjectReferenceLinks",
                column: "ProjectLevelId");

            // Carry the old single "scope" column into links before it disappears.
            // A reference had at most one level, so each image contributes at most
            // one row and cannot collide with the filtered unique index.
            migrationBuilder.Sql(
                """
                INSERT INTO "ProjectReferenceLinks"
                    ("ProjectId", "ProjectConceptImageId", "ProjectLevelId", "ProjectCharacterId", "CreatedAt")
                SELECT ci."ProjectId", ci."Id", ci."ProjectLevelId", NULL, ci."CreatedAt"
                FROM "ProjectConceptImages" ci
                WHERE ci."ProjectLevelId" IS NOT NULL;
                """);

            migrationBuilder.DropForeignKey(
                name: "FK_ProjectConceptImages_ProjectLevels_ProjectLevelId",
                table: "ProjectConceptImages");

            migrationBuilder.DropIndex(
                name: "IX_ProjectConceptImages_ProjectLevelId_SortOrder",
                table: "ProjectConceptImages");

            migrationBuilder.DropColumn(
                name: "ProjectLevelId",
                table: "ProjectConceptImages");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "ProjectLevelId",
                table: "ProjectConceptImages",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_ProjectConceptImages_ProjectLevelId_SortOrder",
                table: "ProjectConceptImages",
                columns: new[] { "ProjectLevelId", "SortOrder" });

            migrationBuilder.AddForeignKey(
                name: "FK_ProjectConceptImages_ProjectLevels_ProjectLevelId",
                table: "ProjectConceptImages",
                column: "ProjectLevelId",
                principalTable: "ProjectLevels",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            // The old column held at most one level per image, so a rollback keeps
            // the first level link and reports the rest as dropped links.
            migrationBuilder.Sql(
                """
                UPDATE "ProjectConceptImages" ci
                SET "ProjectLevelId" = l."ProjectLevelId"
                FROM (
                    SELECT DISTINCT ON ("ProjectConceptImageId")
                        "ProjectConceptImageId", "ProjectLevelId"
                    FROM "ProjectReferenceLinks"
                    WHERE "ProjectLevelId" IS NOT NULL
                    ORDER BY "ProjectConceptImageId", "Id"
                ) l
                WHERE l."ProjectConceptImageId" = ci."Id";
                """);

            migrationBuilder.DropTable(
                name: "ProjectReferenceLinks");
        }
    }
}
