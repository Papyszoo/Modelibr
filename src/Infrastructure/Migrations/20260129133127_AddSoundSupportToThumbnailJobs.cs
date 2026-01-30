using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddSoundSupportToThumbnailJobs : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_ThumbnailJobs_ModelHash_ModelVersionId",
                table: "ThumbnailJobs");

            migrationBuilder.AlterColumn<int>(
                name: "ModelVersionId",
                table: "ThumbnailJobs",
                type: "integer",
                nullable: true,
                oldClrType: typeof(int),
                oldType: "integer");

            migrationBuilder.AlterColumn<int>(
                name: "ModelId",
                table: "ThumbnailJobs",
                type: "integer",
                nullable: true,
                oldClrType: typeof(int),
                oldType: "integer");

            migrationBuilder.AlterColumn<string>(
                name: "ModelHash",
                table: "ThumbnailJobs",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "character varying(64)",
                oldMaxLength: 64);

            migrationBuilder.AddColumn<string>(
                name: "AssetType",
                table: "ThumbnailJobs",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "SoundHash",
                table: "ThumbnailJobs",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "SoundId",
                table: "ThumbnailJobs",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_ThumbnailJobs_ModelHash_ModelVersionId",
                table: "ThumbnailJobs",
                columns: new[] { "ModelHash", "ModelVersionId" },
                unique: true,
                filter: "\"ModelHash\" IS NOT NULL AND \"ModelVersionId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_ThumbnailJobs_SoundHash",
                table: "ThumbnailJobs",
                column: "SoundHash",
                unique: true,
                filter: "\"SoundHash\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_ThumbnailJobs_SoundId",
                table: "ThumbnailJobs",
                column: "SoundId");

            migrationBuilder.AddForeignKey(
                name: "FK_ThumbnailJobs_Sounds_SoundId",
                table: "ThumbnailJobs",
                column: "SoundId",
                principalTable: "Sounds",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_ThumbnailJobs_Sounds_SoundId",
                table: "ThumbnailJobs");

            migrationBuilder.DropIndex(
                name: "IX_ThumbnailJobs_ModelHash_ModelVersionId",
                table: "ThumbnailJobs");

            migrationBuilder.DropIndex(
                name: "IX_ThumbnailJobs_SoundHash",
                table: "ThumbnailJobs");

            migrationBuilder.DropIndex(
                name: "IX_ThumbnailJobs_SoundId",
                table: "ThumbnailJobs");

            migrationBuilder.DropColumn(
                name: "AssetType",
                table: "ThumbnailJobs");

            migrationBuilder.DropColumn(
                name: "SoundHash",
                table: "ThumbnailJobs");

            migrationBuilder.DropColumn(
                name: "SoundId",
                table: "ThumbnailJobs");

            migrationBuilder.AlterColumn<int>(
                name: "ModelVersionId",
                table: "ThumbnailJobs",
                type: "integer",
                nullable: false,
                defaultValue: 0,
                oldClrType: typeof(int),
                oldType: "integer",
                oldNullable: true);

            migrationBuilder.AlterColumn<int>(
                name: "ModelId",
                table: "ThumbnailJobs",
                type: "integer",
                nullable: false,
                defaultValue: 0,
                oldClrType: typeof(int),
                oldType: "integer",
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "ModelHash",
                table: "ThumbnailJobs",
                type: "character varying(64)",
                maxLength: 64,
                nullable: false,
                defaultValue: "",
                oldClrType: typeof(string),
                oldType: "character varying(64)",
                oldMaxLength: 64,
                oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_ThumbnailJobs_ModelHash_ModelVersionId",
                table: "ThumbnailJobs",
                columns: new[] { "ModelHash", "ModelVersionId" },
                unique: true);
        }
    }
}
