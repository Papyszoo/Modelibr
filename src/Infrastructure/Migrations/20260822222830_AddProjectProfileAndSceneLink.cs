using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddProjectProfileAndSceneLink : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "ProjectId",
                table: "Scenes",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Handedness",
                table: "Projects",
                type: "character varying(5)",
                maxLength: 5,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "MaxTextureSize",
                table: "Projects",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "MaxTrianglesPerAsset",
                table: "Projects",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<List<string>>(
                name: "PaletteHex",
                table: "Projects",
                type: "text[]",
                nullable: false,
                defaultValueSql: "'{}'::text[]");

            migrationBuilder.AddColumn<int>(
                name: "PixelsPerUnit",
                table: "Projects",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "TargetSceneTriangles",
                table: "Projects",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "UnitsPerMetre",
                table: "Projects",
                type: "double precision",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "UpAxis",
                table: "Projects",
                type: "character varying(1)",
                maxLength: 1,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "ProjectProfileOptions",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Dimension = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    NormalizedName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    IsBuiltIn = table.Column<bool>(type: "boolean", nullable: false),
                    IsHidden = table.Column<bool>(type: "boolean", nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProjectProfileOptions", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ProjectProfileValues",
                columns: table => new
                {
                    ProjectId = table.Column<int>(type: "integer", nullable: false),
                    OptionId = table.Column<int>(type: "integer", nullable: false),
                    Role = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProjectProfileValues", x => new { x.ProjectId, x.OptionId });
                    table.ForeignKey(
                        name: "FK_ProjectProfileValues_ProjectProfileOptions_OptionId",
                        column: x => x.OptionId,
                        principalTable: "ProjectProfileOptions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ProjectProfileValues_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Scenes_ProjectId",
                table: "Scenes",
                column: "ProjectId");

            migrationBuilder.CreateIndex(
                name: "IX_ProjectProfileOptions_Dimension",
                table: "ProjectProfileOptions",
                column: "Dimension");

            migrationBuilder.CreateIndex(
                name: "IX_ProjectProfileOptions_Dimension_NormalizedName",
                table: "ProjectProfileOptions",
                columns: new[] { "Dimension", "NormalizedName" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ProjectProfileValues_OptionId",
                table: "ProjectProfileValues",
                column: "OptionId");

            migrationBuilder.AddForeignKey(
                name: "FK_Scenes_Projects_ProjectId",
                table: "Scenes",
                column: "ProjectId",
                principalTable: "Projects",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            // The built-in vocabulary (prompt 13-A/B). Seeded here rather than at startup so
            // a fresh install and an upgrade get the same rows, and so the ids are stable.
            //
            // IsBuiltIn = true is what makes these undeletable: deleting one would silently
            // unassign it from every project that had chosen it. A built-in can be hidden.
            // Users add their own options at runtime with IsBuiltIn = false.
            //
            // ON CONFLICT DO NOTHING keeps this re-runnable and keeps it from fighting an
            // option a user happened to create with the same name before upgrading.
            migrationBuilder.Sql(@"
                INSERT INTO ""ProjectProfileOptions""
                    (""Dimension"", ""Name"", ""NormalizedName"", ""IsBuiltIn"", ""IsHidden"", ""SortOrder"", ""CreatedAt"", ""UpdatedAt"")
                SELECT v.dimension, v.name, v.normalized, true, false, v.sort_order,
                       now() AT TIME ZONE 'UTC', now() AT TIME ZONE 'UTC'
                FROM (VALUES
                        ('engine', 'Unity', 'unity', 0),
                        ('engine', 'Unreal', 'unreal', 1),
                        ('engine', 'Godot', 'godot', 2),
                        ('engine', 'three.js', 'three.js', 3),
                        ('engine', 'Blender', 'blender', 4),
                        ('engine', 'GameMaker', 'gamemaker', 5),
                        ('engine', 'Bevy', 'bevy', 6),
                        ('engine', 'Custom', 'custom', 7),
                        ('platform', 'Web', 'web', 0),
                        ('platform', 'PC', 'pc', 1),
                        ('platform', 'Mac', 'mac', 2),
                        ('platform', 'Linux', 'linux', 3),
                        ('platform', 'iOS', 'ios', 4),
                        ('platform', 'Android', 'android', 5),
                        ('platform', 'PlayStation', 'playstation', 6),
                        ('platform', 'Xbox', 'xbox', 7),
                        ('platform', 'Switch', 'switch', 8),
                        ('platform', 'Meta Quest', 'meta quest', 9),
                        ('genre', 'Action', 'action', 0),
                        ('genre', 'Adventure', 'adventure', 1),
                        ('genre', 'Horror', 'horror', 2),
                        ('genre', 'Platformer', 'platformer', 3),
                        ('genre', 'Puzzle', 'puzzle', 4),
                        ('genre', 'RPG', 'rpg', 5),
                        ('genre', 'Racing', 'racing', 6),
                        ('genre', 'Shooter', 'shooter', 7),
                        ('genre', 'Simulation', 'simulation', 8),
                        ('genre', 'Strategy', 'strategy', 9),
                        ('genre', 'Survival', 'survival', 10),
                        ('genre', 'Sandbox', 'sandbox', 11),
                        ('style', 'Low Poly', 'low poly', 0),
                        ('style', 'Stylized', 'stylized', 1),
                        ('style', 'Cartoon', 'cartoon', 2),
                        ('style', 'Cel Shaded', 'cel shaded', 3),
                        ('style', 'Realistic', 'realistic', 4),
                        ('style', 'Pixel Art', 'pixel art', 5),
                        ('style', 'Voxel', 'voxel', 6),
                        ('style', 'Retro / PS1', 'retro / ps1', 7),
                        ('style', 'Hand Painted', 'hand painted', 8),
                        ('style', 'Sci-Fi', 'sci-fi', 9),
                        ('style', 'Fantasy', 'fantasy', 10),
                        ('style', 'Modern', 'modern', 11),
                        ('perspective', 'first-person', 'first-person', 0),
                        ('perspective', 'third-person', 'third-person', 1),
                        ('perspective', 'top-down', 'top-down', 2),
                        ('perspective', 'isometric', 'isometric', 3),
                        ('perspective', 'side-scroller', 'side-scroller', 4),
                        ('perspective', 'fixed-2d', 'fixed-2d', 5)
                ) AS v(dimension, name, normalized, sort_order)
                ON CONFLICT (""Dimension"", ""NormalizedName"") DO NOTHING;
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Scenes_Projects_ProjectId",
                table: "Scenes");

            migrationBuilder.DropTable(
                name: "ProjectProfileValues");

            migrationBuilder.DropTable(
                name: "ProjectProfileOptions");

            migrationBuilder.DropIndex(
                name: "IX_Scenes_ProjectId",
                table: "Scenes");

            migrationBuilder.DropColumn(
                name: "ProjectId",
                table: "Scenes");

            migrationBuilder.DropColumn(
                name: "Handedness",
                table: "Projects");

            migrationBuilder.DropColumn(
                name: "MaxTextureSize",
                table: "Projects");

            migrationBuilder.DropColumn(
                name: "MaxTrianglesPerAsset",
                table: "Projects");

            migrationBuilder.DropColumn(
                name: "PaletteHex",
                table: "Projects");

            migrationBuilder.DropColumn(
                name: "PixelsPerUnit",
                table: "Projects");

            migrationBuilder.DropColumn(
                name: "TargetSceneTriangles",
                table: "Projects");

            migrationBuilder.DropColumn(
                name: "UnitsPerMetre",
                table: "Projects");

            migrationBuilder.DropColumn(
                name: "UpAxis",
                table: "Projects");
        }
    }
}
