using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Infrastructure.Migrations
{
    public partial class AddEnvironmentMaps : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "EnvironmentMapId",
                table: "BatchUploads",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "EnvironmentMaps",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    PreviewVariantId = table.Column<int>(type: "integer", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EnvironmentMaps", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "EnvironmentMapVariants",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    EnvironmentMapId = table.Column<int>(type: "integer", nullable: false),
                    FileId = table.Column<int>(type: "integer", nullable: false),
                    SizeLabel = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EnvironmentMapVariants", x => x.Id);
                    table.ForeignKey(
                        name: "FK_EnvironmentMapVariants_EnvironmentMaps_EnvironmentMapId",
                        column: x => x.EnvironmentMapId,
                        principalTable: "EnvironmentMaps",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_EnvironmentMapVariants_Files_FileId",
                        column: x => x.FileId,
                        principalTable: "Files",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PackEnvironmentMaps",
                columns: table => new
                {
                    EnvironmentMapsId = table.Column<int>(type: "integer", nullable: false),
                    PacksId = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PackEnvironmentMaps", x => new { x.EnvironmentMapsId, x.PacksId });
                    table.ForeignKey(
                        name: "FK_PackEnvironmentMaps_EnvironmentMaps_EnvironmentMapsId",
                        column: x => x.EnvironmentMapsId,
                        principalTable: "EnvironmentMaps",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_PackEnvironmentMaps_Packs_PacksId",
                        column: x => x.PacksId,
                        principalTable: "Packs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ProjectEnvironmentMaps",
                columns: table => new
                {
                    EnvironmentMapsId = table.Column<int>(type: "integer", nullable: false),
                    ProjectsId = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProjectEnvironmentMaps", x => new { x.EnvironmentMapsId, x.ProjectsId });
                    table.ForeignKey(
                        name: "FK_ProjectEnvironmentMaps_EnvironmentMaps_EnvironmentMapsId",
                        column: x => x.EnvironmentMapsId,
                        principalTable: "EnvironmentMaps",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ProjectEnvironmentMaps_Projects_ProjectsId",
                        column: x => x.ProjectsId,
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_BatchUploads_EnvironmentMapId",
                table: "BatchUploads",
                column: "EnvironmentMapId");

            migrationBuilder.CreateIndex(
                name: "IX_EnvironmentMaps_IsDeleted",
                table: "EnvironmentMaps",
                column: "IsDeleted");

            migrationBuilder.CreateIndex(
                name: "IX_EnvironmentMaps_Name",
                table: "EnvironmentMaps",
                column: "Name");

            migrationBuilder.CreateIndex(
                name: "IX_EnvironmentMapVariants_EnvironmentMapId",
                table: "EnvironmentMapVariants",
                column: "EnvironmentMapId");

            migrationBuilder.CreateIndex(
                name: "IX_EnvironmentMapVariants_FileId",
                table: "EnvironmentMapVariants",
                column: "FileId");

            migrationBuilder.CreateIndex(
                name: "IX_EnvironmentMapVariants_IsDeleted",
                table: "EnvironmentMapVariants",
                column: "IsDeleted");

            migrationBuilder.CreateIndex(
                name: "IX_EnvironmentMapVariants_EnvironmentMapId_SizeLabel",
                table: "EnvironmentMapVariants",
                columns: new[] { "EnvironmentMapId", "SizeLabel" },
                unique: true,
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_PackEnvironmentMaps_PacksId",
                table: "PackEnvironmentMaps",
                column: "PacksId");

            migrationBuilder.CreateIndex(
                name: "IX_ProjectEnvironmentMaps_ProjectsId",
                table: "ProjectEnvironmentMaps",
                column: "ProjectsId");

            migrationBuilder.AddForeignKey(
                name: "FK_BatchUploads_EnvironmentMaps_EnvironmentMapId",
                table: "BatchUploads",
                column: "EnvironmentMapId",
                principalTable: "EnvironmentMaps",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_BatchUploads_EnvironmentMaps_EnvironmentMapId",
                table: "BatchUploads");

            migrationBuilder.DropTable(
                name: "EnvironmentMapVariants");

            migrationBuilder.DropTable(
                name: "PackEnvironmentMaps");

            migrationBuilder.DropTable(
                name: "ProjectEnvironmentMaps");

            migrationBuilder.DropTable(
                name: "EnvironmentMaps");

            migrationBuilder.DropIndex(
                name: "IX_BatchUploads_EnvironmentMapId",
                table: "BatchUploads");

            migrationBuilder.DropColumn(
                name: "EnvironmentMapId",
                table: "BatchUploads");
        }
    }
}
