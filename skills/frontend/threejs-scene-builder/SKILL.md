---
name: threejs-scene-builder
description: "Creates 3D scenes with Three.js (React Three Fiber), rendered as Astro islands."
---

# Three.js Scene Builder

Three.js specialist. Create 3D scenes from descriptions.

## Instructions

1. Receive the scene assignment (goal + context) or the feature description.

2. Write the 3D scene code:
   - React Three Fiber (`Canvas`, `ambientLight`, `directionalLight`, meshes)
   - `@react-three/drei` when needed (`OrbitControls`, model loaders)
   - Lighting (AmbientLight, DirectionalLight)
   - Objects (cubes, spheres, models)

3. Best practices:
   - Dispose geometries/materials/helpers in `useEffect` cleanup and on
     unmount — repeated mounts leak GPU memory otherwise
   - Limit draw calls (InstancedMesh when needed)
   - Animate with `useFrame`
   - Component props carry scene data; the scene never fetches

4. Models: GLTFLoader or drei `useGLTF`.

5. Return complete scene code.

## Where a scene goes

A `Canvas` scene is an organism, not a dedicated segment. Place it in the
`ui/organisms/` of the slice that owns it:

- `shared/ui/organisms/` — domain-free, reused by two or more consumers
- `entities/<name>/ui/organisms/` — renders one domain concept
- `features/<name>/ui/organisms/` — single interaction

The organism mounts as an Astro island with `client:load` — the Canvas needs
browser APIs. Static markup around the scene renders without JS; a poster image
in the island slot keeps the area meaningful before hydration.

## Success Criteria
- Scene works in browser
- Code follows Three.js/R3F best practices
- Scene matches description
- Disposal runs on unmount; scene props come from the spec