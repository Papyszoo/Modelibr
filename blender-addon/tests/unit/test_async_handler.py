"""
Unit tests for the async handler module.
Tests thread-safety of progress tracking.
"""
import unittest
import threading
import time
import sys
import os
import importlib.util


# Direct module import to avoid triggering bpy
def import_module_directly(module_name, module_path):
    spec = importlib.util.spec_from_file_location(module_name, module_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


base_path = os.path.join(os.path.dirname(__file__), '..', '..')
modelibr_path = os.path.join(base_path, 'modelibr')

async_handler = import_module_directly('modelibr.async_handler', os.path.join(modelibr_path, 'async_handler.py'))

TaskStatus = async_handler.TaskStatus
ProgressState = async_handler.ProgressState
ProgressTracker = async_handler.ProgressTracker
BackgroundTask = async_handler.BackgroundTask
register_task = async_handler.register_task
unregister_task = async_handler.unregister_task
get_task = async_handler.get_task
has_active_task = async_handler.has_active_task
cancel_all_tasks = async_handler.cancel_all_tasks


class TestTaskStatus(unittest.TestCase):
    """Test TaskStatus enum."""
    
    def test_status_values(self):
        """Test all status values exist."""
        self.assertIsNotNone(TaskStatus.PENDING)
        self.assertIsNotNone(TaskStatus.RUNNING)
        self.assertIsNotNone(TaskStatus.COMPLETED)
        self.assertIsNotNone(TaskStatus.FAILED)
        self.assertIsNotNone(TaskStatus.CANCELLED)


class TestProgressState(unittest.TestCase):
    """Test ProgressState dataclass."""
    
    def test_default_values(self):
        """Test default state values."""
        state = ProgressState()
        self.assertEqual(state.status, TaskStatus.PENDING)
        self.assertEqual(state.progress, 0.0)
        self.assertEqual(state.message, "")
        self.assertEqual(state.error, "")
        self.assertIsNone(state.result)


class TestProgressTracker(unittest.TestCase):
    """Test ProgressTracker thread-safety."""
    
    def test_initial_state(self):
        """Test initial tracker state."""
        tracker = ProgressTracker()
        state = tracker.get_state()
        
        self.assertEqual(state.status, TaskStatus.PENDING)
        self.assertEqual(state.progress, 0.0)
    
    def test_update_progress(self):
        """Test updating progress."""
        tracker = ProgressTracker()
        tracker.update(progress=0.5, message="Halfway")
        
        state = tracker.get_state()
        self.assertEqual(state.progress, 0.5)
        self.assertEqual(state.message, "Halfway")
    
    def test_progress_clamping(self):
        """Test that progress is clamped to 0-1."""
        tracker = ProgressTracker()
        
        tracker.update(progress=-0.5)
        self.assertEqual(tracker.get_state().progress, 0.0)
        
        tracker.update(progress=1.5)
        self.assertEqual(tracker.get_state().progress, 1.0)
    
    def test_set_running(self):
        """Test set_running method."""
        tracker = ProgressTracker()
        tracker.set_running("Starting...")
        
        state = tracker.get_state()
        self.assertEqual(state.status, TaskStatus.RUNNING)
        self.assertEqual(state.progress, 0.0)
        self.assertEqual(state.message, "Starting...")
        self.assertTrue(tracker.is_running)
    
    def test_set_completed(self):
        """Test set_completed method."""
        tracker = ProgressTracker()
        tracker.set_running()
        tracker.set_completed({"result": "data"})
        
        state = tracker.get_state()
        self.assertEqual(state.status, TaskStatus.COMPLETED)
        self.assertEqual(state.progress, 1.0)
        self.assertEqual(state.result, {"result": "data"})
        self.assertTrue(tracker.is_finished)
        self.assertFalse(tracker.is_running)
    
    def test_set_failed(self):
        """Test set_failed method."""
        tracker = ProgressTracker()
        tracker.set_running()
        tracker.set_failed("Something went wrong")
        
        state = tracker.get_state()
        self.assertEqual(state.status, TaskStatus.FAILED)
        self.assertEqual(state.error, "Something went wrong")
        self.assertTrue(tracker.is_finished)
    
    def test_set_cancelled(self):
        """Test set_cancelled method."""
        tracker = ProgressTracker()
        tracker.set_running()
        tracker.set_cancelled()
        
        state = tracker.get_state()
        self.assertEqual(state.status, TaskStatus.CANCELLED)
        self.assertTrue(tracker.is_finished)
    
    def test_thread_safety(self):
        """Test that tracker is thread-safe."""
        tracker = ProgressTracker()
        errors = []
        
        def update_progress(start, count):
            try:
                for i in range(count):
                    tracker.update(progress=(start + i) / 100.0)
                    tracker.get_state()
            except Exception as e:
                errors.append(e)
        
        threads = [
            threading.Thread(target=update_progress, args=(0, 50)),
            threading.Thread(target=update_progress, args=(50, 50)),
        ]
        
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        
        self.assertEqual(len(errors), 0)


class TestBackgroundTask(unittest.TestCase):
    """Test BackgroundTask base class."""
    
    def test_task_must_implement_run(self):
        """Test that run() must be implemented."""
        task = BackgroundTask()
        
        with self.assertRaises(NotImplementedError):
            task.run()
    
    def test_task_start_and_complete(self):
        """Test starting and completing a task."""
        class SimpleTask(BackgroundTask):
            def run(self):
                self.tracker.update(progress=0.5, message="Working...")
                self.tracker.set_completed("done")
        
        task = SimpleTask()
        task.start()
        task.wait(timeout=2.0)
        
        state = task.tracker.get_state()
        self.assertEqual(state.status, TaskStatus.COMPLETED)
        self.assertEqual(state.result, "done")
    
    def test_task_exception_handling(self):
        """Test that exceptions are caught and set as failure."""
        class FailingTask(BackgroundTask):
            def run(self):
                raise ValueError("Test error")
        
        task = FailingTask()
        task.start()
        task.wait(timeout=2.0)
        
        state = task.tracker.get_state()
        self.assertEqual(state.status, TaskStatus.FAILED)
        self.assertIn("Test error", state.error)


if __name__ == '__main__':
    unittest.main()
