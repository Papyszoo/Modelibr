import * as signalR from '@microsoft/signalr'

import type { StoreImportProgressEvent } from '../types'

// Only log in development mode (mirrors ThumbnailSignalRService).
const isDev = import.meta.env.DEV
const log = (message: string, ...args: unknown[]) => {
  if (isDev) {
    console.log(message, ...args)
  }
}

type ImportProgressCallback = (event: StoreImportProgressEvent) => void

/**
 * SignalR client for the local backend's StoreImportHub. Import progress is
 * best-effort push — the import controller also polls the job endpoint, so a
 * failed hub connection degrades to polling, never blocks an import.
 */
class StoreImportSignalRService {
  private connection: signalR.HubConnection | null = null
  private connectPromise: Promise<void> | null = null
  private callbacks: Set<ImportProgressCallback> = new Set()

  private getHubUrl(): string {
    const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'
    return `${baseUrl}/storeImportHub`
  }

  async connect(): Promise<void> {
    if (this.connection?.state === signalR.HubConnectionState.Connected) {
      return
    }
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
    this.connection = new signalR.HubConnectionBuilder()
      .withUrl(this.getHubUrl())
      .withAutomaticReconnect()
      .configureLogging(
        isDev ? signalR.LogLevel.Information : signalR.LogLevel.Warning
      )
      .build()

    this.connection.on('ImportProgress', (event: StoreImportProgressEvent) => {
      log('StoreImportSignalR: ImportProgress', event)
      this.callbacks.forEach(callback => callback(event))
    })

    await this.connection.start()
    log('StoreImportSignalR: Connected')
  }

  async joinJobGroup(jobId: number): Promise<void> {
    await this.connect()
    if (this.connection?.state === signalR.HubConnectionState.Connected) {
      await this.connection.invoke('JoinJobGroup', jobId.toString())
    }
  }

  async leaveJobGroup(jobId: number): Promise<void> {
    if (this.connection?.state === signalR.HubConnectionState.Connected) {
      await this.connection.invoke('LeaveJobGroup', jobId.toString())
    }
  }

  onImportProgress(callback: ImportProgressCallback): () => void {
    this.callbacks.add(callback)
    return () => {
      this.callbacks.delete(callback)
    }
  }
}

export const storeImportSignalRService = new StoreImportSignalRService()
