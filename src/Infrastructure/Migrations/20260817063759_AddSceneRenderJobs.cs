using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddSceneRenderJobs : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "SceneId",
                table: "ThumbnailJobs",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SceneViewpoint",
                table: "ThumbnailJobs",
                type: "character varying(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_ThumbnailJobs_SceneId",
                table: "ThumbnailJobs",
                column: "SceneId");

            migrationBuilder.AddForeignKey(
                name: "FK_ThumbnailJobs_Scenes_SceneId",
                table: "ThumbnailJobs",
                column: "SceneId",
                principalTable: "Scenes",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_ThumbnailJobs_Scenes_SceneId",
                table: "ThumbnailJobs");

            migrationBuilder.DropIndex(
                name: "IX_ThumbnailJobs_SceneId",
                table: "ThumbnailJobs");

            migrationBuilder.DropColumn(
                name: "SceneId",
                table: "ThumbnailJobs");

            migrationBuilder.DropColumn(
                name: "SceneViewpoint",
                table: "ThumbnailJobs");
        }
    }
}
