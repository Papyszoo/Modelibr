"""
Async handler for non-blocking operations in Blender.
Provides thread-safe progress tracking and background task management.

Usage:
    - BackgroundTask handles download/upload in separate thread
    - ProgressTracker stores state safely between threads
    - Modal operators poll progress via timer and update UI
"""
import threading
import queue
from dataclasses import dataclass, field
from typing import Optional, Callable, Any, Dict
from enum import Enum, auto


class TaskStatus(Enum):
    """Status of a background task."""
    PENDING = auto()
    RUNNING = auto()
    COMPLETED = auto()
    FAILED = auto()
    CANCELLED = auto()


@dataclass
class ProgressState:
    """
    Thread-safe progress state container.
    
    Attributes:
        status: Current task status
        progress: Progress percentage (0.0 to 1.0)
        message: Current status message
        error: Error message if failed
        result: Task result data
    """
    status: TaskStatus = TaskStatus.PENDING
    progress: float = 0.0
    message: str = ""
    error: str = ""
    result: Any = None


class ProgressTracker:
    """
    Thread-safe progress tracking for background operations.
    
    This class provides a safe way to communicate progress
    from a background thread to the main Blender thread.
    """
    
    def __init__(self):
        self._lock = threading.Lock()
        self._state = ProgressState()
    
    def get_state(self) -> ProgressState:
        """Get a copy of the current progress state."""
        with self._lock:
            return ProgressState(
                status=self._state.status,
                progress=self._state.progress,
                message=self._state.message,
                error=self._state.error,
                result=self._state.result
            )
    
    def update(
        self,
        progress: Optional[float] = None,
        message: Optional[str] = None,
        status: Optional[TaskStatus] = None
    ) -> None:
        """Update progress state (thread-safe)."""
        with self._lock:
            if progress is not None:
                self._state.progress = min(1.0, max(0.0, progress))
            if message is not None:
                self._state.message = message
            if status is not None:
                self._state.status = status
    
    def set_running(self, message: str = "Starting...") -> None:
        """Mark task as running."""
        self.update(progress=0.0, message=message, status=TaskStatus.RUNNING)
    
    def set_completed(self, result: Any = None) -> None:
        """Mark task as completed with optional result."""
        with self._lock:
            self._state.status = TaskStatus.COMPLETED
            self._state.progress = 1.0
            self._state.message = "Complete"
            self._state.result = result
    
    def set_failed(self, error: str) -> None:
        """Mark task as failed with error message."""
        with self._lock:
            self._state.status = TaskStatus.FAILED
            self._state.error = error
            self._state.message = f"Error: {error}"
    
    def set_cancelled(self) -> None:
        """Mark task as cancelled."""
        self.update(message="Cancelled", status=TaskStatus.CANCELLED)
    
    @property
    def is_running(self) -> bool:
        """Check if task is currently running."""
        with self._lock:
            return self._state.status == TaskStatus.RUNNING
    
    @property
    def is_finished(self) -> bool:
        """Check if task has finished (completed, failed, or cancelled)."""
        with self._lock:
            return self._state.status in (
                TaskStatus.COMPLETED,
                TaskStatus.FAILED,
                TaskStatus.CANCELLED
            )


class BackgroundTask:
    """
    Base class for background tasks that run in a separate thread.
    
    Subclasses should implement the `run()` method to perform
    the actual work. Use `self.tracker` to report progress.
    
    Example:
        class DownloadTask(BackgroundTask):
            def run(self):
                self.tracker.set_running("Downloading...")
                # ... download logic with progress updates ...
                self.tracker.set_completed(downloaded_data)
    """
    
    def __init__(self):
        self.tracker = ProgressTracker()
        self._thread: Optional[threading.Thread] = None
        self._cancel_requested = threading.Event()
    
    def start(self) -> None:
        """Start the background task in a new thread."""
        if self._thread is not None and self._thread.is_alive():
            return
        
        self._cancel_requested.clear()
        self._thread = threading.Thread(target=self._run_wrapper, daemon=True)
        self._thread.start()
    
    def _run_wrapper(self) -> None:
        """Wrapper that catches exceptions and updates tracker."""
        try:
            self.tracker.set_running()
            self.run()
            if not self.tracker.is_finished:
                self.tracker.set_completed()
        except Exception as e:
            self.tracker.set_failed(str(e))
    
    def run(self) -> None:
        """
        Override this method to perform the background work.
        
        Use self.tracker to report progress:
            self.tracker.update(progress=0.5, message="Halfway done")
        
        Check self.should_cancel periodically for cancellation:
            if self.should_cancel:
                self.tracker.set_cancelled()
                return
        """
        raise NotImplementedError("Subclasses must implement run()")
    
    def cancel(self) -> None:
        """Request cancellation of the task."""
        self._cancel_requested.set()
    
    @property
    def should_cancel(self) -> bool:
        """Check if cancellation has been requested."""
        return self._cancel_requested.is_set()
    
    def wait(self, timeout: Optional[float] = None) -> bool:
        """Wait for the task to complete. Returns True if completed."""
        if self._thread is not None:
            self._thread.join(timeout=timeout)
            return not self._thread.is_alive()
        return True


# Global task registry for active async operations
_active_tasks: Dict[str, BackgroundTask] = {}
_tasks_lock = threading.Lock()


def register_task(task_id: str, task: BackgroundTask) -> None:
    """Register an active background task."""
    with _tasks_lock:
        _active_tasks[task_id] = task


def unregister_task(task_id: str) -> None:
    """Remove a task from the registry."""
    with _tasks_lock:
        _active_tasks.pop(task_id, None)


def get_task(task_id: str) -> Optional[BackgroundTask]:
    """Get an active task by ID."""
    with _tasks_lock:
        return _active_tasks.get(task_id)


def has_active_task() -> bool:
    """Check if any async operation is currently running."""
    with _tasks_lock:
        return any(
            task.tracker.is_running 
            for task in _active_tasks.values()
        )


def get_active_progress() -> Optional[ProgressState]:
    """Get progress state of first running task, if any."""
    with _tasks_lock:
        for task in _active_tasks.values():
            if task.tracker.is_running:
                return task.tracker.get_state()
    return None


def cancel_all_tasks() -> None:
    """Request cancellation of all active tasks."""
    with _tasks_lock:
        for task in _active_tasks.values():
            task.cancel()
