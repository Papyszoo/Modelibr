using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddTextureSetTagAssignments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "TextureSetTagAssignments",
                columns: table => new
                {
                    TextureSetId = table.Column<int>(type: "integer", nullable: false),
                    ModelTagId = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TextureSetTagAssignments", x => new { x.TextureSetId, x.ModelTagId });
                    table.ForeignKey(
                        name: "FK_TextureSetTagAssignments_ModelTags_ModelTagId",
                        column: x => x.ModelTagId,
                        principalTable: "ModelTags",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_TextureSetTagAssignments_TextureSets_TextureSetId",
                        column: x => x.TextureSetId,
                        principalTable: "TextureSets",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_TextureSetTagAssignments_ModelTagId",
                table: "TextureSetTagAssignments",
                column: "ModelTagId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "TextureSetTagAssignments");
        }
    }
}
