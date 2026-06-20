using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddScriptsAndScriptCategories : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ScriptCategories",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Description = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    ParentId = table.Column<int>(type: "integer", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ScriptCategories", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ScriptCategories_ScriptCategories_ParentId",
                        column: x => x.ParentId,
                        principalTable: "ScriptCategories",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Scripts",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    FileId = table.Column<int>(type: "integer", nullable: false),
                    ScriptCategoryId = table.Column<int>(type: "integer", nullable: true),
                    Language = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    LineCount = table.Column<int>(type: "integer", nullable: false),
                    SizeBytes = table.Column<long>(type: "bigint", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Scripts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Scripts_Files_FileId",
                        column: x => x.FileId,
                        principalTable: "Files",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_Scripts_ScriptCategories_ScriptCategoryId",
                        column: x => x.ScriptCategoryId,
                        principalTable: "ScriptCategories",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ScriptCategories_ParentId_Name",
                table: "ScriptCategories",
                columns: new[] { "ParentId", "Name" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Scripts_FileId",
                table: "Scripts",
                column: "FileId");

            migrationBuilder.CreateIndex(
                name: "IX_Scripts_IsDeleted",
                table: "Scripts",
                column: "IsDeleted");

            migrationBuilder.CreateIndex(
                name: "IX_Scripts_Name",
                table: "Scripts",
                column: "Name");

            migrationBuilder.CreateIndex(
                name: "IX_Scripts_ScriptCategoryId",
                table: "Scripts",
                column: "ScriptCategoryId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Scripts");

            migrationBuilder.DropTable(
                name: "ScriptCategories");
        }
    }
}
