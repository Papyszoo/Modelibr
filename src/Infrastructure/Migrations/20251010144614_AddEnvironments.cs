using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddEnvironments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Environments",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Description = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    IsDefault = table.Column<bool>(type: "boolean", nullable: false),
                    LightIntensity = table.Column<double>(type: "double precision", nullable: false),
                    EnvironmentPreset = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    ShowShadows = table.Column<bool>(type: "boolean", nullable: false),
                    ShadowType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    ShadowOpacity = table.Column<double>(type: "double precision", nullable: false),
                    ShadowBlur = table.Column<double>(type: "double precision", nullable: false),
                    AutoAdjustCamera = table.Column<bool>(type: "boolean", nullable: false),
                    CameraDistance = table.Column<double>(type: "double precision", nullable: true),
                    CameraAngle = table.Column<double>(type: "double precision", nullable: true),
                    BackgroundModelId = table.Column<int>(type: "integer", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Environments", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Environments_IsDefault",
                table: "Environments",
                column: "IsDefault");

            migrationBuilder.CreateIndex(
                name: "IX_Environments_Name",
                table: "Environments",
                column: "Name",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Environments");
        }
    }
}
