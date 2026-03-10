using System.Collections.Generic;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class MaterialSlotMapping : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_ModelVersionTextureSets_ModelVersions_ModelVersionsId",
                table: "ModelVersionTextureSets");

            migrationBuilder.DropForeignKey(
                name: "FK_ModelVersionTextureSets_TextureSets_TextureSetsId",
                table: "ModelVersionTextureSets");

            migrationBuilder.DropPrimaryKey(
                name: "PK_ModelVersionTextureSets",
                table: "ModelVersionTextureSets");

            migrationBuilder.RenameColumn(
                name: "TextureSetsId",
                table: "ModelVersionTextureSets",
                newName: "TextureSetId");

            migrationBuilder.RenameColumn(
                name: "ModelVersionsId",
                table: "ModelVersionTextureSets",
                newName: "ModelVersionId");

            migrationBuilder.RenameIndex(
                name: "IX_ModelVersionTextureSets_TextureSetsId",
                table: "ModelVersionTextureSets",
                newName: "IX_ModelVersionTextureSets_TextureSetId");

            migrationBuilder.AddColumn<string>(
                name: "MaterialName",
                table: "ModelVersionTextureSets",
                type: "character varying(200)",
                maxLength: 200,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<List<string>>(
                name: "MaterialNames",
                table: "ModelVersions",
                type: "text[]",
                nullable: false,
                defaultValueSql: "'{}'::text[]");

            migrationBuilder.AddPrimaryKey(
                name: "PK_ModelVersionTextureSets",
                table: "ModelVersionTextureSets",
                columns: new[] { "ModelVersionId", "TextureSetId", "MaterialName" });

            migrationBuilder.AddForeignKey(
                name: "FK_ModelVersionTextureSets_ModelVersions_ModelVersionId",
                table: "ModelVersionTextureSets",
                column: "ModelVersionId",
                principalTable: "ModelVersions",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_ModelVersionTextureSets_TextureSets_TextureSetId",
                table: "ModelVersionTextureSets",
                column: "TextureSetId",
                principalTable: "TextureSets",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_ModelVersionTextureSets_ModelVersions_ModelVersionId",
                table: "ModelVersionTextureSets");

            migrationBuilder.DropForeignKey(
                name: "FK_ModelVersionTextureSets_TextureSets_TextureSetId",
                table: "ModelVersionTextureSets");

            migrationBuilder.DropPrimaryKey(
                name: "PK_ModelVersionTextureSets",
                table: "ModelVersionTextureSets");

            migrationBuilder.DropColumn(
                name: "MaterialName",
                table: "ModelVersionTextureSets");

            migrationBuilder.DropColumn(
                name: "MaterialNames",
                table: "ModelVersions");

            migrationBuilder.RenameColumn(
                name: "TextureSetId",
                table: "ModelVersionTextureSets",
                newName: "TextureSetsId");

            migrationBuilder.RenameColumn(
                name: "ModelVersionId",
                table: "ModelVersionTextureSets",
                newName: "ModelVersionsId");

            migrationBuilder.RenameIndex(
                name: "IX_ModelVersionTextureSets_TextureSetId",
                table: "ModelVersionTextureSets",
                newName: "IX_ModelVersionTextureSets_TextureSetsId");

            migrationBuilder.AddPrimaryKey(
                name: "PK_ModelVersionTextureSets",
                table: "ModelVersionTextureSets",
                columns: new[] { "ModelVersionsId", "TextureSetsId" });

            migrationBuilder.AddForeignKey(
                name: "FK_ModelVersionTextureSets_ModelVersions_ModelVersionsId",
                table: "ModelVersionTextureSets",
                column: "ModelVersionsId",
                principalTable: "ModelVersions",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_ModelVersionTextureSets_TextureSets_TextureSetsId",
                table: "ModelVersionTextureSets",
                column: "TextureSetsId",
                principalTable: "TextureSets",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }
    }
}
