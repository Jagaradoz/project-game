# Blender Asset Directory

This directory contains authoring `.blend` source files, rigs, and animations organized by category.

---

## 🧙‍♂️ Magicians (`magicians/`)

Playable spellcaster characters: **Mage**, **Druid**, **Skeleton Mage**, **Witch**, and **Magical Girl**.

| File | Purpose | Notes |
|---|---|---|
| `magicians_animation_catalog_refined.blend` | **Master Catalog** | Contains all 5 characters, rigs, weapons, and refined `Run` and `Attack` animations. Run `tools/export_magician_game_clips.py` to export game-ready GLBs. |
| `magicians_scene.blend` | Source Character Scene | Base uncataloged meshes, textures, and weapon geometry. |
| `magicians_animation_catalog.blend` | Intermediate Catalog | Pre-refinement animation staging file. |
| `backups/` | Auto-backups | `.blend1` and timestamped backups. |

### Exporting Magicians to In-Game GLB:
```bash
blender --background public/assets/models/blender/magicians/magicians_animation_catalog_refined.blend --python tools/export_magician_game_clips.py
```
Exports game-ready GLBs to: `public/assets/models/characters/animated/`.

---

## 🌲 Forest Enemies (`forest_enemies/`)

Forest biome adversaries: **Bramble Skeleton**, **Shroom Brute**, **Goblin Scout**, and **Elder Treant**.

| File | Purpose | Notes |
|---|---|---|
| `forest_characters_rigged_walk.blend` | **Master Rigged Characters** | 17-bone armature, weight-painted geometry, and looping in-place **Walk** actions (24 fps). |
| `forest_selected_characters.blend` | Source Models | Clean unrigged meshes and props. |
| `backups/` | Auto-backups & Archives | `.blend1` backups and legacy catalog archive `character_catalog_2026-09-30.blend`. |

### Re-generating Forest Rigs & Walk Cycles:
```bash
blender --background public/assets/models/blender/forest_enemies/forest_selected_characters.blend --python tools/rig_forest_walks.py
```

---

## 🖼️ Previews & Stills
Rendered preview stills are organized in `public/assets/models/previews/`:
- `previews/magicians/`: Attack animation cycle contact and passing renders.
- `previews/forest/`: Forest character contact and passing walk renders.
