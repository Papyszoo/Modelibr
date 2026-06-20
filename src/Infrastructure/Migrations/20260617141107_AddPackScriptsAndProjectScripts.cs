using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPackScriptsAndProjectScripts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "PackScripts",
                columns: table => new
                {
                    PacksId = table.Column<int>(type: "integer", nullable: false),
                    ScriptsId = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PackScripts", x => new { x.PacksId, x.ScriptsId });
                    table.ForeignKey(
                        name: "FK_PackScripts_Packs_PacksId",
                        column: x => x.PacksId,
                        principalTable: "Packs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_PackScripts_Scripts_ScriptsId",
                        column: x => x.ScriptsId,
                        principalTable: "Scripts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ProjectScripts",
                columns: table => new
                {
                    ProjectsId = table.Column<int>(type: "integer", nullable: false),
                    ScriptsId = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProjectScripts", x => new { x.ProjectsId, x.ScriptsId });
                    table.ForeignKey(
                        name: "FK_ProjectScripts_Projects_ProjectsId",
                        column: x => x.ProjectsId,
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ProjectScripts_Scripts_ScriptsId",
                        column: x => x.ScriptsId,
                        principalTable: "Scripts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PackScripts_ScriptsId",
                table: "PackScripts",
                column: "ScriptsId");

            migrationBuilder.CreateIndex(
                name: "IX_ProjectScripts_ScriptsId",
                table: "ProjectScripts",
                column: "ScriptsId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PackScripts");

            migrationBuilder.DropTable(
                name: "ProjectScripts");
        }
    }
}
