# Broadleaf tree refinement

- Summary: Refined oak, plateau, simple, and thin trees in the existing Blender environment catalog; saved a backup before replacing their geometry.
- Key changes: Root Oak materials, fused branching trunks, short buttress roots, bark ridges and knots, and airy faceted foliage. Follow-up reduced 119 overlapping foliage meshes to 34 rounder, separated tufts while preserving all wood geometry. Preserved each silhouette, 2.8 display height, and tile placement. Triangle counts: oak 2,844; plateau 2,906; simple 2,842; thin 2,658. Reusable `tools/refine_catalog_broadleaf_trees.py` script and refreshed `broadleaf-quality.png` preview. Development version: `2.7.1-alpha.10`.
- Validation: Live Blender geometry/bounds checks passed; all 438 non-foliage objects matched the pre-edit snapshot. Viewed the updated Blender viewport and rendered preview. Python syntax validation passed. Vitest: 163 tests passed; typecheck and lint passed.
- Blockers: None. These are Blender catalog refinements; original nature GLBs and game runtime selections are unchanged.
