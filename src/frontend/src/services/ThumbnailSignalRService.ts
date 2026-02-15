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

// Only log in development mode
const isDev = import.meta.env.DEV
const log = (message: string, ...args: unknown[]) => {
  if (isDev) {
    console.log(message, ...args)
  }
}

class ThumbnailSignalRService {
  private connection: signalR.HubConnection | null = null
  private thumbnailStatusCallbacks: Set<ThumbnailStatusChangedCallback> =
    new Set()
  private activeVersionCallbacks: Set<ActiveVersionChangedCallback> = new Set()
  private connectPromise: Promise<void> | null = null
  private reconnectAttempts: number = 0
  private maxReconnectAttempts: number = 5

  private getHubUrl(): string {
    const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'
    return `${baseUrl}/thumbnailHub`
  }

  async connect(): Promise<void> {
    if (this.connection?.state === signalR.HubConnectionState.Connected) {
      return
    }

    // If already connecting, wait for the existing connection attempt
    if (this.connectPromise) {
      await this.connectPromise
      return
    }

    this.connectPromise = this.doConnect()
    try {
      await this.connectPromise
    } finally {
      this.connectPromise = null
    }
  }

  private async doConnect(): Promise<void> {
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
        .configureLogging(
          isDev ? signalR.LogLevel.Information : signalR.LogLevel.Warning
        )
        .build()

      // Set up event handlers
      this.connection.on(
        'ThumbnailStatusChanged',
        (event: ThumbnailStatusChangedEvent) => {
          log('ThumbnailSignalR: Received ThumbnailStatusChanged event', event)
          log(
            `ThumbnailSignalR: Notifying ${this.thumbnailStatusCallbacks.size} callback(s)`
          )
          this.thumbnailStatusCallbacks.forEach(callback => callback(event))
        }
      )

      this.connection.on(
        'ActiveVersionChanged',
        (event: ActiveVersionChangedEvent) => {
          log('ThumbnailSignalR: Received ActiveVersionChanged event', event)
          log(
            `ThumbnailSignalR: Notifying ${this.activeVersionCallbacks.size} callback(s)`
          )
          this.activeVersionCallbacks.forEach(callback => callback(event))
        }
      )

      this.connection.onreconnecting(() => {
        log('ThumbnailSignalR: Reconnecting...')
      })

      this.connection.onreconnected(async () => {
        log('ThumbnailSignalR: Reconnected, re-joining AllModelsGroup')
        this.reconnectAttempts = 0
        // Re-join groups after reconnect — server-side group membership is tied to connection ID
        try {
          await this.joinAllModelsGroup()
        } catch (error) {
          console.error(
            'ThumbnailSignalR: Failed to re-join AllModelsGroup after reconnect',
            error
          )
        }
      })

      this.connection.onclose(() => {
        log('ThumbnailSignalR: Connection closed')
      })

      await this.connection.start()
      log('ThumbnailSignalR: Connected')
      this.reconnectAttempts = 0
    } catch (error) {
      console.error('ThumbnailSignalR: Failed to connect', error)
      this.reconnectAttempts++
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
      log('ThumbnailSignalR: Joined AllModelsGroup')
    }
  }

  async leaveAllModelsGroup(): Promise<void> {
    if (this.connection?.state === signalR.HubConnectionState.Connected) {
      await this.connection.invoke('LeaveAllModelsGroup')
      log('ThumbnailSignalR: Left AllModelsGroup')
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
    log(
      `ThumbnailSignalR: Registered ThumbnailStatusChanged callback. Total: ${this.thumbnailStatusCallbacks.size}`
    )
    return () => {
      this.thumbnailStatusCallbacks.delete(callback)
      log(
        `ThumbnailSignalR: Unregistered ThumbnailStatusChanged callback. Total: ${this.thumbnailStatusCallbacks.size}`
      )
    }
  }

  onActiveVersionChanged(callback: ActiveVersionChangedCallback): () => void {
    this.activeVersionCallbacks.add(callback)
    log(
      `ThumbnailSignalR: Registered ActiveVersionChanged callback. Total: ${this.activeVersionCallbacks.size}`
    )
    return () => {
      this.activeVersionCallbacks.delete(callback)
      log(
        `ThumbnailSignalR: Unregistered ActiveVersionChanged callback. Total: ${this.activeVersionCallbacks.size}`
      )
    }
  }

  isConnected(): boolean {
    return this.connection?.state === signalR.HubConnectionState.Connected
  }
}

// Export singleton instance
export const thumbnailSignalRService = new ThumbnailSignalRService()
