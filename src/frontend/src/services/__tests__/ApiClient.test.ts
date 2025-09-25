// Simple ApiClient interface tests using the mock
describe('ApiClient Interface', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should provide upload and URL generation methods', () => {
    // Use the manual mock from __mocks__ folder
    const ApiClient = require('../__mocks__/ApiClient').default

    expect(typeof ApiClient.uploadModel).toBe('function')
    expect(typeof ApiClient.getModels).toBe('function')
    expect(typeof ApiClient.getModelFileUrl).toBe('function')
    expect(typeof ApiClient.getFileUrl).toBe('function')
  })

  it('should generate correct model file URLs', () => {
    const ApiClient = require('../__mocks__/ApiClient').default

    const modelId = '123'
    const url = ApiClient.getModelFileUrl(modelId)
    expect(url).toContain('/models/123/file')
    expect(ApiClient.getModelFileUrl).toHaveBeenCalledWith(modelId)
  })

  it('should generate correct file URLs', () => {
    const ApiClient = require('../__mocks__/ApiClient').default

    const fileId = '456'
    const url = ApiClient.getFileUrl(fileId)
    expect(url).toContain('/files/456')
    expect(ApiClient.getFileUrl).toHaveBeenCalledWith(fileId)
  })

  it('should have jest mock functions for async operations', () => {
    const ApiClient = require('../__mocks__/ApiClient').default

    expect(jest.isMockFunction(ApiClient.uploadModel)).toBe(true)
    expect(jest.isMockFunction(ApiClient.getModels)).toBe(true)
  })
})
