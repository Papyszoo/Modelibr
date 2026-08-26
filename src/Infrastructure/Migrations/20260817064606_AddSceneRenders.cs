using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddSceneRenders : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "SceneRenders",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    SceneId = table.Column<int>(type: "integer", nullable: false),
                    ThumbnailJobId = table.Column<int>(type: "integer", nullable: false),
                    Viewpoint = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    FilePath = table.Column<string>(type: "text", nullable: false),
                    SizeBytes = table.Column<long>(type: "bigint", nullable: false),
                    Width = table.Column<int>(type: "integer", nullable: false),
                    Height = table.Column<int>(type: "integer", nullable: false),
                    NodesLoaded = table.Column<int>(type: "integer", nullable: false),
                    NodesFailed = table.Column<int>(type: "integer", nullable: false),
                    TimedOut = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SceneRenders", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SceneRenders_Scenes_SceneId",
                        column: x => x.SceneId,
                        principalTable: "Scenes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_SceneRenders_SceneId_CreatedAt",
                table: "SceneRenders",
                columns: new[] { "SceneId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_SceneRenders_ThumbnailJobId",
                table: "SceneRenders",
                column: "ThumbnailJobId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "SceneRenders");
        }
    }
}
