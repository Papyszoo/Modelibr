using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class InitialMigration : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ApplicationSettings",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    MaxFileSizeBytes = table.Column<long>(type: "bigint", nullable: false),
                    MaxThumbnailSizeBytes = table.Column<long>(type: "bigint", nullable: false),
                    ThumbnailFrameCount = table.Column<int>(type: "integer", nullable: false),
                    ThumbnailCameraVerticalAngle = table.Column<double>(type: "double precision", nullable: false),
                    ThumbnailWidth = table.Column<int>(type: "integer", nullable: false),
                    ThumbnailHeight = table.Column<int>(type: "integer", nullable: false),
                    GenerateThumbnailOnUpload = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ApplicationSettings", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Files",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    OriginalFileName = table.Column<string>(type: "text", nullable: false),
                    StoredFileName = table.Column<string>(type: "text", nullable: false),
                    FilePath = table.Column<string>(type: "text", nullable: false),
                    MimeType = table.Column<string>(type: "text", nullable: false),
                    FileType = table.Column<string>(type: "text", nullable: false),
                    SizeBytes = table.Column<long>(type: "bigint", nullable: false),
                    Sha256Hash = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Files", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Packs",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Description = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Packs", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Stages",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    ConfigurationJson = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Stages", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "TextureSets",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TextureSets", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Models",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Name = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Tags = table.Column<string>(type: "text", nullable: true),
                    Description = table.Column<string>(type: "text", nullable: true),
                    DefaultTextureSetId = table.Column<int>(type: "integer", nullable: true),
                    Vertices = table.Column<int>(type: "integer", nullable: true),
                    Faces = table.Column<int>(type: "integer", nullable: true),
                    PolyCount = table.Column<int>(type: "integer", nullable: false),
                    IsHidden = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Models", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Models_TextureSets_DefaultTextureSetId",
                        column: x => x.DefaultTextureSetId,
                        principalTable: "TextureSets",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "PackTextureSets",
                columns: table => new
                {
                    PacksId = table.Column<int>(type: "integer", nullable: false),
                    TextureSetsId = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PackTextureSets", x => new { x.PacksId, x.TextureSetsId });
                    table.ForeignKey(
                        name: "FK_PackTextureSets_Packs_PacksId",
                        column: x => x.PacksId,
                        principalTable: "Packs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_PackTextureSets_TextureSets_TextureSetsId",
                        column: x => x.TextureSetsId,
                        principalTable: "TextureSets",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Textures",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    FileId = table.Column<int>(type: "integer", nullable: false),
                    TextureType = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    TextureSetId = table.Column<int>(type: "integer", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Textures", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Textures_Files_FileId",
                        column: x => x.FileId,
                        principalTable: "Files",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_Textures_TextureSets_TextureSetId",
                        column: x => x.TextureSetId,
                        principalTable: "TextureSets",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

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

            migrationBuilder.CreateTable(
                name: "ModelFiles",
                columns: table => new
                {
                    FilesId = table.Column<int>(type: "integer", nullable: false),
                    ModelsId = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ModelFiles", x => new { x.FilesId, x.ModelsId });
                    table.ForeignKey(
                        name: "FK_ModelFiles_Files_FilesId",
                        column: x => x.FilesId,
                        principalTable: "Files",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ModelFiles_Models_ModelsId",
                        column: x => x.ModelsId,
                        principalTable: "Models",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ModelTextureSets",
                columns: table => new
                {
                    ModelsId = table.Column<int>(type: "integer", nullable: false),
                    TextureSetsId = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ModelTextureSets", x => new { x.ModelsId, x.TextureSetsId });
                    table.ForeignKey(
                        name: "FK_ModelTextureSets_Models_ModelsId",
                        column: x => x.ModelsId,
                        principalTable: "Models",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ModelTextureSets_TextureSets_TextureSetsId",
                        column: x => x.TextureSetsId,
                        principalTable: "TextureSets",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PackModels",
                columns: table => new
                {
                    ModelsId = table.Column<int>(type: "integer", nullable: false),
                    PacksId = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PackModels", x => new { x.ModelsId, x.PacksId });
                    table.ForeignKey(
                        name: "FK_PackModels_Models_ModelsId",
                        column: x => x.ModelsId,
                        principalTable: "Models",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_PackModels_Packs_PacksId",
                        column: x => x.PacksId,
                        principalTable: "Packs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ThumbnailJobs",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ModelId = table.Column<int>(type: "integer", nullable: false),
                    ModelHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    AttemptCount = table.Column<int>(type: "integer", nullable: false),
                    MaxAttempts = table.Column<int>(type: "integer", nullable: false),
                    ErrorMessage = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    LockedBy = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    LockedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    LockTimeoutMinutes = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CompletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ThumbnailJobs", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ThumbnailJobs_Models_ModelId",
                        column: x => x.ModelId,
                        principalTable: "Models",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Thumbnails",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ModelId = table.Column<int>(type: "integer", nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    ThumbnailPath = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    SizeBytes = table.Column<long>(type: "bigint", nullable: true),
                    Width = table.Column<int>(type: "integer", nullable: true),
                    Height = table.Column<int>(type: "integer", nullable: true),
                    ErrorMessage = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ProcessedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Thumbnails", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Thumbnails_Models_ModelId",
                        column: x => x.ModelId,
                        principalTable: "Models",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ThumbnailJobEvents",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ThumbnailJobId = table.Column<int>(type: "integer", nullable: false),
                    EventType = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Message = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    Metadata = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: true),
                    ErrorMessage = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    OccurredAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ThumbnailJobEvents", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ThumbnailJobEvents_ThumbnailJobs_ThumbnailJobId",
                        column: x => x.ThumbnailJobId,
                        principalTable: "ThumbnailJobs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
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

            migrationBuilder.CreateIndex(
                name: "IX_ModelFiles_ModelsId",
                table: "ModelFiles",
                column: "ModelsId");

            migrationBuilder.CreateIndex(
                name: "IX_Models_DefaultTextureSetId",
                table: "Models",
                column: "DefaultTextureSetId");

            migrationBuilder.CreateIndex(
                name: "IX_Models_IsHidden",
                table: "Models",
                column: "IsHidden");

            migrationBuilder.CreateIndex(
                name: "IX_Models_Name_Vertices",
                table: "Models",
                columns: new[] { "Name", "Vertices" });

            migrationBuilder.CreateIndex(
                name: "IX_Models_PolyCount",
                table: "Models",
                column: "PolyCount");

            migrationBuilder.CreateIndex(
                name: "IX_ModelTextureSets_TextureSetsId",
                table: "ModelTextureSets",
                column: "TextureSetsId");

            migrationBuilder.CreateIndex(
                name: "IX_PackModels_PacksId",
                table: "PackModels",
                column: "PacksId");

            migrationBuilder.CreateIndex(
                name: "IX_Packs_Name",
                table: "Packs",
                column: "Name");

            migrationBuilder.CreateIndex(
                name: "IX_PackTextureSets_TextureSetsId",
                table: "PackTextureSets",
                column: "TextureSetsId");

            migrationBuilder.CreateIndex(
                name: "IX_Stages_Name",
                table: "Stages",
                column: "Name");

            migrationBuilder.CreateIndex(
                name: "IX_Textures_FileId_TextureType",
                table: "Textures",
                columns: new[] { "FileId", "TextureType" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Textures_TextureSetId_TextureType",
                table: "Textures",
                columns: new[] { "TextureSetId", "TextureType" },
                unique: true,
                filter: "\"TextureSetId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Textures_TextureType",
                table: "Textures",
                column: "TextureType");

            migrationBuilder.CreateIndex(
                name: "IX_TextureSets_Name",
                table: "TextureSets",
                column: "Name");

            migrationBuilder.CreateIndex(
                name: "IX_ThumbnailJobEvents_ThumbnailJobId_OccurredAt",
                table: "ThumbnailJobEvents",
                columns: new[] { "ThumbnailJobId", "OccurredAt" });

            migrationBuilder.CreateIndex(
                name: "IX_ThumbnailJobs_ModelHash",
                table: "ThumbnailJobs",
                column: "ModelHash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ThumbnailJobs_ModelId",
                table: "ThumbnailJobs",
                column: "ModelId");

            migrationBuilder.CreateIndex(
                name: "IX_ThumbnailJobs_Status_CreatedAt",
                table: "ThumbnailJobs",
                columns: new[] { "Status", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_Thumbnails_ModelId",
                table: "Thumbnails",
                column: "ModelId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ApplicationSettings");

            migrationBuilder.DropTable(
                name: "BatchUploads");

            migrationBuilder.DropTable(
                name: "ModelFiles");

            migrationBuilder.DropTable(
                name: "ModelTextureSets");

            migrationBuilder.DropTable(
                name: "PackModels");

            migrationBuilder.DropTable(
                name: "PackTextureSets");

            migrationBuilder.DropTable(
                name: "Stages");

            migrationBuilder.DropTable(
                name: "Textures");

            migrationBuilder.DropTable(
                name: "ThumbnailJobEvents");

            migrationBuilder.DropTable(
                name: "Thumbnails");

            migrationBuilder.DropTable(
                name: "Packs");

            migrationBuilder.DropTable(
                name: "Files");

            migrationBuilder.DropTable(
                name: "ThumbnailJobs");

            migrationBuilder.DropTable(
                name: "Models");

            migrationBuilder.DropTable(
                name: "TextureSets");
        }
    }
}
