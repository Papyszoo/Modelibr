using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class StrictTextureChannelConstraint : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Textures_TextureSetId_FileId_TextureType_SourceChannel",
                table: "Textures");

            // Cleanup duplicate channels before adding unique constraint
            // Keep the most recently updated texture for each (TextureSetId, FileId, SourceChannel) group
            migrationBuilder.Sql(@"
                DELETE FROM ""Textures""
                WHERE ""Id"" IN (
                    SELECT ""Id""
                    FROM (
                        SELECT ""Id"",
                        ROW_NUMBER() OVER (
                            PARTITION BY ""TextureSetId"", ""FileId"", ""SourceChannel""
                            ORDER BY ""UpdatedAt"" DESC
                        ) as rn
                        FROM ""Textures""
                        WHERE ""IsDeleted"" = false
                    ) t
                    WHERE t.rn > 1
                );
            ");

            migrationBuilder.CreateIndex(
                name: "IX_Textures_TextureSetId_FileId_SourceChannel",
                table: "Textures",
                columns: new[] { "TextureSetId", "FileId", "SourceChannel" },
                unique: true,
                filter: "\"TextureSetId\" IS NOT NULL AND \"IsDeleted\" = false");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Textures_TextureSetId_FileId_SourceChannel",
                table: "Textures");

            migrationBuilder.CreateIndex(
                name: "IX_Textures_TextureSetId_FileId_TextureType_SourceChannel",
                table: "Textures",
                columns: new[] { "TextureSetId", "FileId", "TextureType", "SourceChannel" },
                unique: true);
        }
    }
}
