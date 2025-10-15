using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddDefaultTextureSetToModel : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "DefaultTextureSetId",
                table: "Models",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Models_DefaultTextureSetId",
                table: "Models",
                column: "DefaultTextureSetId");

            migrationBuilder.AddForeignKey(
                name: "FK_Models_TextureSets_DefaultTextureSetId",
                table: "Models",
                column: "DefaultTextureSetId",
                principalTable: "TextureSets",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Models_TextureSets_DefaultTextureSetId",
                table: "Models");

            migrationBuilder.DropIndex(
                name: "IX_Models_DefaultTextureSetId",
                table: "Models");

            migrationBuilder.DropColumn(
                name: "DefaultTextureSetId",
                table: "Models");
        }
    }
}
