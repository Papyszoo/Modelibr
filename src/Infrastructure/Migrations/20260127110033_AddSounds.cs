using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddSounds : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "SoundId",
                table: "BatchUploads",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "SoundCategories",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Description = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SoundCategories", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Sounds",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    FileId = table.Column<int>(type: "integer", nullable: false),
                    SoundCategoryId = table.Column<int>(type: "integer", nullable: true),
                    Duration = table.Column<double>(type: "double precision", nullable: false),
                    Peaks = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Sounds", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Sounds_Files_FileId",
                        column: x => x.FileId,
                        principalTable: "Files",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_Sounds_SoundCategories_SoundCategoryId",
                        column: x => x.SoundCategoryId,
                        principalTable: "SoundCategories",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "PackSounds",
                columns: table => new
                {
                    PacksId = table.Column<int>(type: "integer", nullable: false),
                    SoundsId = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PackSounds", x => new { x.PacksId, x.SoundsId });
                    table.ForeignKey(
                        name: "FK_PackSounds_Packs_PacksId",
                        column: x => x.PacksId,
                        principalTable: "Packs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_PackSounds_Sounds_SoundsId",
                        column: x => x.SoundsId,
                        principalTable: "Sounds",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ProjectSounds",
                columns: table => new
                {
                    ProjectsId = table.Column<int>(type: "integer", nullable: false),
                    SoundsId = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProjectSounds", x => new { x.ProjectsId, x.SoundsId });
                    table.ForeignKey(
                        name: "FK_ProjectSounds_Projects_ProjectsId",
                        column: x => x.ProjectsId,
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ProjectSounds_Sounds_SoundsId",
                        column: x => x.SoundsId,
                        principalTable: "Sounds",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_BatchUploads_SoundId",
                table: "BatchUploads",
                column: "SoundId");

            migrationBuilder.CreateIndex(
                name: "IX_PackSounds_SoundsId",
                table: "PackSounds",
                column: "SoundsId");

            migrationBuilder.CreateIndex(
                name: "IX_ProjectSounds_SoundsId",
                table: "ProjectSounds",
                column: "SoundsId");

            migrationBuilder.CreateIndex(
                name: "IX_SoundCategories_Name",
                table: "SoundCategories",
                column: "Name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Sounds_FileId",
                table: "Sounds",
                column: "FileId");

            migrationBuilder.CreateIndex(
                name: "IX_Sounds_IsDeleted",
                table: "Sounds",
                column: "IsDeleted");

            migrationBuilder.CreateIndex(
                name: "IX_Sounds_Name",
                table: "Sounds",
                column: "Name");

            migrationBuilder.CreateIndex(
                name: "IX_Sounds_SoundCategoryId",
                table: "Sounds",
                column: "SoundCategoryId");

            migrationBuilder.AddForeignKey(
                name: "FK_BatchUploads_Sounds_SoundId",
                table: "BatchUploads",
                column: "SoundId",
                principalTable: "Sounds",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_BatchUploads_Sounds_SoundId",
                table: "BatchUploads");

            migrationBuilder.DropTable(
                name: "PackSounds");

            migrationBuilder.DropTable(
                name: "ProjectSounds");

            migrationBuilder.DropTable(
                name: "Sounds");

            migrationBuilder.DropTable(
                name: "SoundCategories");

            migrationBuilder.DropIndex(
                name: "IX_BatchUploads_SoundId",
                table: "BatchUploads");

            migrationBuilder.DropColumn(
                name: "SoundId",
                table: "BatchUploads");
        }
    }
}
