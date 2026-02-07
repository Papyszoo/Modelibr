---
sidebar_position: 6
---

# Sounds

Modelibr includes a built-in sound manager for organizing audio assets alongside your 3D models and sprites. Sounds are ideal for sound effects, ambient audio, UI feedback, and any audio content your project needs.

<div className="feature-video-container">
  <video controls width="100%" autoPlay muted loop>
    <source src="/Modelibr/videos/sounds.webm" type="video/webm" />
    <p className="video-fallback">Demo video is being generated...</p>
  </video>
</div>

## Uploading Sounds

### Drag and Drop

Drag audio files directly onto the Sound Library panel to upload them.

**Supported formats:** WAV, MP3, OGG, FLAC

### What Happens After Upload

1. **Sound Created** — A new sound entry appears in your library
2. **Waveform Generated** — A visual waveform preview is generated automatically by the worker service
3. **Ready to Use** — Click to play, preview, or assign to packs/projects

:::tip Batch Upload
You can drag multiple audio files at once. Each file becomes a separate sound.
:::

## Sound Grid

Sounds are displayed in a responsive card grid with automatic waveform thumbnails. Each card shows:

- **Waveform preview** — Visual representation of the audio waveform
- **Name** — The filename (editable)
- **Duration** — Length of the audio clip
- **File size** — Original file size

## Playback Controls

Each sound card includes built-in playback controls:

- **Play/Pause** — Click the play button to preview the sound directly in the browser
- **Playhead** — A visual playhead moves across the waveform during playback
- **Reset** — Click the reset button to return to the beginning of the track

:::tip Quick Preview
Click anywhere on a sound card to select it, then use the play button to preview the audio without leaving the library view.
:::

## Managing Sounds

### Renaming

Right-click a sound card and select **Rename** to change its display name.

### Organizing with Categories

Use category tabs (above the grid) to organize sounds into groups:

- Click **+** to create a new category
- Drag sounds between categories
- Categories persist across sessions via URL state

### Recycling

To remove a sound:

1. Right-click the sound card
2. Select **Recycle**
3. The sound moves to [Recycled Files](./recycled-files)

:::note
Recycled sounds can be restored from the Recycled Files panel.
:::

## Using Sounds in Packs & Projects

Sounds can be added to [Packs](./packs) and [Projects](./projects) for organized asset collections. Open a pack or project and click **Add Sound** to include sounds from your library.
