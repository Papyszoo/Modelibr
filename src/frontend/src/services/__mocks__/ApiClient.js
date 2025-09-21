export default {
  uploadModel: jest.fn(),
  getModels: jest.fn(),
  getModelFileUrl: jest.fn((modelId) => `http://localhost:5009/models/${modelId}/file`),
  getFileUrl: jest.fn((fileId) => `http://localhost:5009/files/${fileId}`)
}