export default {
  uploadModel: jest.fn(),
  uploadFile: jest.fn(),
  getModels: jest.fn(),
  getModelById: jest.fn(),
  getModelFileUrl: jest.fn(
    modelId => `http://localhost:5009/models/${modelId}/file`
  ),
  getFileUrl: jest.fn(fileId => `http://localhost:5009/files/${fileId}`),
  getThumbnailStatus: jest.fn(),
  getThumbnailUrl: jest.fn(
    modelId => `http://localhost:5009/models/${modelId}/thumbnail/file`
  ),
  regenerateThumbnail: jest.fn(),
  getTextureSetById: jest.fn(),
  getPackById: jest.fn(),
  getProjectById: jest.fn(),
  getStageById: jest.fn(),
}
