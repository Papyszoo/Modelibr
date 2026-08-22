using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddSoundAndSpriteTagsAndDescription : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Description",
                table: "Sprites",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Description",
                table: "Sounds",
                type: "text",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "SoundTagAssignments",
                columns: table => new
                {
                    SoundId = table.Column<int>(type: "integer", nullable: false),
                    ModelTagId = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SoundTagAssignments", x => new { x.SoundId, x.ModelTagId });
                    table.ForeignKey(
                        name: "FK_SoundTagAssignments_ModelTags_ModelTagId",
                        column: x => x.ModelTagId,
                        principalTable: "ModelTags",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_SoundTagAssignments_Sounds_SoundId",
                        column: x => x.SoundId,
                        principalTable: "Sounds",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "SpriteTagAssignments",
                columns: table => new
                {
                    SpriteId = table.Column<int>(type: "integer", nullable: false),
                    ModelTagId = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SpriteTagAssignments", x => new { x.SpriteId, x.ModelTagId });
                    table.ForeignKey(
                        name: "FK_SpriteTagAssignments_ModelTags_ModelTagId",
                        column: x => x.ModelTagId,
                        principalTable: "ModelTags",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_SpriteTagAssignments_Sprites_SpriteId",
                        column: x => x.SpriteId,
                        principalTable: "Sprites",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_SoundTagAssignments_ModelTagId",
                table: "SoundTagAssignments",
                column: "ModelTagId");

            migrationBuilder.CreateIndex(
                name: "IX_SpriteTagAssignments_ModelTagId",
                table: "SpriteTagAssignments",
                column: "ModelTagId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "SoundTagAssignments");

            migrationBuilder.DropTable(
                name: "SpriteTagAssignments");

            migrationBuilder.DropColumn(
                name: "Description",
                table: "Sprites");

            migrationBuilder.DropColumn(
                name: "Description",
                table: "Sounds");
        }
    }
}
