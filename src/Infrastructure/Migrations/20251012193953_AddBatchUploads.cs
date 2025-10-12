using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddBatchUploads : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "BatchUploads",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    BatchId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    UploadType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    UploadedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    PackId = table.Column<int>(type: "integer", nullable: true),
                    ModelId = table.Column<int>(type: "integer", nullable: true),
                    TextureSetId = table.Column<int>(type: "integer", nullable: true),
                    FileId = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BatchUploads", x => x.Id);
                    table.ForeignKey(
                        name: "FK_BatchUploads_Files_FileId",
                        column: x => x.FileId,
                        principalTable: "Files",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_BatchUploads_Models_ModelId",
                        column: x => x.ModelId,
                        principalTable: "Models",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_BatchUploads_Packs_PackId",
                        column: x => x.PackId,
                        principalTable: "Packs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_BatchUploads_TextureSets_TextureSetId",
                        column: x => x.TextureSetId,
                        principalTable: "TextureSets",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "IX_BatchUploads_BatchId",
                table: "BatchUploads",
                column: "BatchId");

            migrationBuilder.CreateIndex(
                name: "IX_BatchUploads_FileId",
                table: "BatchUploads",
                column: "FileId");

            migrationBuilder.CreateIndex(
                name: "IX_BatchUploads_ModelId",
                table: "BatchUploads",
                column: "ModelId");

            migrationBuilder.CreateIndex(
                name: "IX_BatchUploads_PackId",
                table: "BatchUploads",
                column: "PackId");

            migrationBuilder.CreateIndex(
                name: "IX_BatchUploads_TextureSetId",
                table: "BatchUploads",
                column: "TextureSetId");

            migrationBuilder.CreateIndex(
                name: "IX_BatchUploads_UploadedAt",
                table: "BatchUploads",
                column: "UploadedAt");

            migrationBuilder.CreateIndex(
                name: "IX_BatchUploads_UploadType",
                table: "BatchUploads",
                column: "UploadType");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "BatchUploads");
        }
    }
}
