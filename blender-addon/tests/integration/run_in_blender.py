"""
Integration tests that run inside Blender.
Tests addon registration, preferences, and operators.

Run with: blender --background --python tests/integration/run_in_blender.py
"""
import sys
import os
import traceback


def run_tests():
    """Run integration tests inside Blender."""
    results = {
        'passed': 0,
        'failed': 0,
        'errors': []
    }
    
    # Test addon registration
    try:
        test_addon_registration()
        print("✓ test_addon_registration")
        results['passed'] += 1
    except Exception as e:
        print(f"✗ test_addon_registration: {e}")
        results['failed'] += 1
        results['errors'].append(('test_addon_registration', str(e), traceback.format_exc()))
    
    # Test addon preferences
    try:
        test_addon_preferences()
        print("✓ test_addon_preferences")
        results['passed'] += 1
    except Exception as e:
        print(f"✗ test_addon_preferences: {e}")
        results['failed'] += 1
        results['errors'].append(('test_addon_preferences', str(e), traceback.format_exc()))
    
    # Test property groups
    try:
        test_property_groups()
        print("✓ test_property_groups")
        results['passed'] += 1
    except Exception as e:
        print(f"✗ test_property_groups: {e}")
        results['failed'] += 1
        results['errors'].append(('test_property_groups', str(e), traceback.format_exc()))
    
    # Test operators exist
    try:
        test_operators_registered()
        print("✓ test_operators_registered")
        results['passed'] += 1
    except Exception as e:
        print(f"✗ test_operators_registered: {e}")
        results['failed'] += 1
        results['errors'].append(('test_operators_registered', str(e), traceback.format_exc()))
    
    # Test panels exist
    try:
        test_panels_registered()
        print("✓ test_panels_registered")
        results['passed'] += 1
    except Exception as e:
        print(f"✗ test_panels_registered: {e}")
        results['failed'] += 1
        results['errors'].append(('test_panels_registered', str(e), traceback.format_exc()))
    
    # Run texture flow tests
    print("\n--- Texture Flow Tests ---")
    try:
        from . import test_texture_flow
        texture_results = test_texture_flow.run_tests()
        results['passed'] += texture_results['passed']
        results['failed'] += texture_results['failed']
        results['errors'].extend(texture_results['errors'])
    except ImportError:
        # Try direct import for standalone run
        try:
            import test_texture_flow
            texture_results = test_texture_flow.run_tests()
            results['passed'] += texture_results['passed']
            results['failed'] += texture_results['failed']
            results['errors'].extend(texture_results['errors'])
        except ImportError as e:
            print(f"✗ Could not import texture flow tests: {e}")
            results['failed'] += 1
            results['errors'].append(('import_texture_flow', str(e), traceback.format_exc()))
    
    return results


def test_addon_registration():
    """Test that addon can be registered."""
    import bpy
    
    # Check if addon is registered
    addon_name = "modelibr"
    
    # Try to enable if not already enabled
    if addon_name not in bpy.context.preferences.addons:
        # Add addon path
        addon_path = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
        if addon_path not in sys.path:
            sys.path.insert(0, addon_path)
        
        # Import and register
        import modelibr
        modelibr.register()
    
    assert hasattr(bpy.types, 'MODELIBR_OT_import_model'), "Import operator not registered"
    assert hasattr(bpy.types, 'MODELIBR_PT_main_panel'), "Main panel not registered"


def test_addon_preferences():
    """Test addon preferences structure."""
    import bpy
    
    # Import preferences module
    addon_path = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
    if addon_path not in sys.path:
        sys.path.insert(0, addon_path)
    
    from modelibr.preferences import ModelibrPreferences
    
    # Check property types
    assert hasattr(ModelibrPreferences, '__annotations__'), "No annotations on preferences"
    annotations = ModelibrPreferences.__annotations__
    
    assert 'server_url' in annotations or hasattr(ModelibrPreferences, 'server_url'), \
        "server_url property missing"


def test_property_groups():
    """Test scene property groups."""
    import bpy
    
    # Import properties module
    addon_path = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
    if addon_path not in sys.path:
        sys.path.insert(0, addon_path)
    
    from modelibr.properties import ModelibrSceneProperties
    
    # Check property group has expected properties
    assert hasattr(ModelibrSceneProperties, '__annotations__') or \
           hasattr(ModelibrSceneProperties, 'current_model_id'), \
        "Scene properties missing expected fields"


def test_operators_registered():
    """Test that all operators are registered."""
    import bpy
    
    expected_operators = [
        'MODELIBR_OT_import_model',
        'MODELIBR_OT_import_model_async',
        'MODELIBR_OT_upload_version',
        'MODELIBR_OT_upload_version_async',
        'MODELIBR_OT_upload_new_model',
        'MODELIBR_OT_test_connection',
        'MODELIBR_OT_refresh_models',
    ]
    
    for op_name in expected_operators:
        assert hasattr(bpy.types, op_name), f"Operator {op_name} not registered"


def test_panels_registered():
    """Test that all panels are registered."""
    import bpy
    
    expected_panels = [
        'MODELIBR_PT_main_panel',
        'MODELIBR_PT_upload_panel',
        'MODELIBR_PT_imported_panel',
    ]
    
    for panel_name in expected_panels:
        assert hasattr(bpy.types, panel_name), f"Panel {panel_name} not registered"


if __name__ == '__main__':
    print("\n" + "="*50)
    print("Modelibr Blender Integration Tests")
    print("="*50 + "\n")
    
    results = run_tests()
    
    print("\n" + "-"*50)
    print(f"Results: {results['passed']} passed, {results['failed']} failed")
    
    if results['errors']:
        print("\nErrors:")
        for name, error, tb in results['errors']:
            print(f"\n{name}:")
            print(tb)
    
    # Exit with proper code
    sys.exit(0 if results['failed'] == 0 else 1)
