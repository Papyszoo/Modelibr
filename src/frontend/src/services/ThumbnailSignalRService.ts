import * as signalR from '@microsoft/signalr'

export interface ThumbnailStatusChangedEvent {
  modelVersionId: number
  status: string
  thumbnailUrl: string | null
  errorMessage: string | null
  timestamp: string
}

export interface ActiveVersionChangedEvent {
  modelId: number
  newActiveVersionId: number
  previousActiveVersionId: number | null
  hasThumbnail: boolean
  thumbnailUrl: string | null
  timestamp: string
}

type ThumbnailStatusChangedCallback = (
  event: ThumbnailStatusChangedEvent
) => void
type ActiveVersionChangedCallback = (event: ActiveVersionChangedEvent) => void

class ThumbnailSignalRService {
  private connection: signalR.HubConnection | null = null
  private thumbnailStatusCallbacks: Set<ThumbnailStatusChangedCallback> =
    new Set()
  private activeVersionCallbacks: Set<ActiveVersionChangedCallback> = new Set()
  private isConnecting: boolean = false
  private reconnectAttempts: number = 0
  private maxReconnectAttempts: number = 5

  constructor() {
    this.connection = null
  }

  private getHubUrl(): string {
    const baseUrl =
      import.meta.env.VITE_API_BASE_URL || 'https://localhost:8081'
    return `${baseUrl}/thumbnailHub`
  }

  async connect(): Promise<void> {
    if (this.connection?.state === signalR.HubConnectionState.Connected) {
      return
    }

    if (this.isConnecting) {
      return
    }

    this.isConnecting = true

    try {
      this.connection = new signalR.HubConnectionBuilder()
        .withUrl(this.getHubUrl())
        .withAutomaticReconnect({
          nextRetryDelayInMilliseconds: retryContext => {
            if (retryContext.previousRetryCount >= this.maxReconnectAttempts) {
              return null // Stop reconnecting
            }
            // Exponential backoff: 1s, 2s, 4s, 8s, 16s
            return Math.min(
              1000 * Math.pow(2, retryContext.previousRetryCount),
              16000
            )
          },
        })
        .configureLogging(signalR.LogLevel.Warning)
        .build()

      // Set up event handlers
      this.connection.on(
        'ThumbnailStatusChanged',
        (event: ThumbnailStatusChangedEvent) => {
          this.thumbnailStatusCallbacks.forEach(callback => callback(event))
        }
      )

      this.connection.on(
        'ActiveVersionChanged',
        (event: ActiveVersionChangedEvent) => {
          this.activeVersionCallbacks.forEach(callback => callback(event))
        }
      )

      this.connection.onreconnecting(() => {
        console.log('ThumbnailSignalR: Reconnecting...')
      })

      this.connection.onreconnected(() => {
        console.log('ThumbnailSignalR: Reconnected')
        this.reconnectAttempts = 0
      })

      this.connection.onclose(() => {
        console.log('ThumbnailSignalR: Connection closed')
      })

      await this.connection.start()
      console.log('ThumbnailSignalR: Connected')
      this.reconnectAttempts = 0
    } catch (error) {
      console.error('ThumbnailSignalR: Failed to connect', error)
      this.reconnectAttempts++
    } finally {
      this.isConnecting = false
    }
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      await this.connection.stop()
      this.connection = null
    }
  }

  async joinAllModelsGroup(): Promise<void> {
    if (this.connection?.state === signalR.HubConnectionState.Connected) {
      await this.connection.invoke('JoinAllModelsGroup')
    }
  }

  async leaveAllModelsGroup(): Promise<void> {
    if (this.connection?.state === signalR.HubConnectionState.Connected) {
      await this.connection.invoke('LeaveAllModelsGroup')
    }
  }

  async joinModelVersionGroup(modelVersionId: number): Promise<void> {
    if (this.connection?.state === signalR.HubConnectionState.Connected) {
      await this.connection.invoke(
        'JoinModelVersionGroup',
        modelVersionId.toString()
      )
    }
  }

  async leaveModelVersionGroup(modelVersionId: number): Promise<void> {
    if (this.connection?.state === signalR.HubConnectionState.Connected) {
      await this.connection.invoke(
        'LeaveModelVersionGroup',
        modelVersionId.toString()
      )
    }
  }

  async joinModelActiveVersionGroup(modelId: number): Promise<void> {
    if (this.connection?.state === signalR.HubConnectionState.Connected) {
      await this.connection.invoke(
        'JoinModelActiveVersionGroup',
        modelId.toString()
      )
    }
  }

  async leaveModelActiveVersionGroup(modelId: number): Promise<void> {
    if (this.connection?.state === signalR.HubConnectionState.Connected) {
      await this.connection.invoke(
        'LeaveModelActiveVersionGroup',
        modelId.toString()
      )
    }
  }

  onThumbnailStatusChanged(
    callback: ThumbnailStatusChangedCallback
  ): () => void {
    this.thumbnailStatusCallbacks.add(callback)
    return () => {
      this.thumbnailStatusCallbacks.delete(callback)
    }
  }

  onActiveVersionChanged(callback: ActiveVersionChangedCallback): () => void {
    this.activeVersionCallbacks.add(callback)
    return () => {
      this.activeVersionCallbacks.delete(callback)
    }
  }

  isConnected(): boolean {
    return this.connection?.state === signalR.HubConnectionState.Connected
  }
}

// Export singleton instance
export const thumbnailSignalRService = new ThumbnailSignalRService()
export default thumbnailSignalRService
