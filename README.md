# Lumos: The Hidden Chamber

**Lumos: The Hidden Chamber** is an interactive 3D WebGL project developed for the **CENG376 – Computer Graphics** course at Gazi University.

The project takes place in a dark magical chamber where the user explores the environment using a first-person camera. The main interaction mechanic is a wand-based dynamic light source inspired by the “Lumos” spell. Hidden magical objects become visible when illuminated and can be interacted with using different spell effects.

---

## Project Overview

The goal of this project is to create an immersive real-time 3D scene using WebGL. The user navigates through a dark dungeon-like room and discovers magical artifacts such as a crystal ball, a ring, and a spellbook.

The project focuses on:

- Real-time rendering
- Dynamic lighting
- First-person camera movement
- Object interaction
- Basic shading and materials
- Magical visual effects

---

## Magical Objects

The scene includes three main magical artifacts:

| Object                  | Description                                        |
| ----------------------- | -------------------------------------------------- |
| Palantir / Crystal Ball | A glowing or reflective magical sphere             |
| Ring                    | A metallic torus-shaped golden ring                |
| Spellbook               | A textured book object with magical visual details |

---

## Controls

| Input                   | Action                          |
| ----------------------- | ------------------------------- |
| W                       | Move forward                    |
| A                       | Move left                       |
| S                       | Move backward                   |
| D                       | Move right                      |
| Mouse movement          | Rotate camera                   |
| Mouse wheel / UI slider | Adjust Lumos light intensity    |
| Left click              | Select or interact with objects |
| 1                       | Activate Lumos spell            |
| 2                       | Activate levitation effect      |
| 3                       | Activate reveal/color spell     |
| F                       | Activate fun spell              |

> Controls may be updated as the project develops.

---

## Technologies Used

- HTML
- CSS
- JavaScript
- WebGL
- Vite
- Git & GitHub

---

## Project Architecture & Modules

To ensure scalability, readability, and a clean separation of concerns, the codebase is structured using ES Modules. The core logic is divided into three primary scripts:

- **`main.js`**: The main entry point of the application. It handles WebGL context initialization, shader compilation, buffer management, and the `requestAnimationFrame` render loop. The static environment architecture (walls, floor, ceiling, arches, iron bars, and tables) is constructed and rendered here. Transform matrices are applied to position the dynamic objects within the scene.
- **`camera.js`**: Encapsulates the first-person camera and navigation mechanics. It manages WASD translation matrix calculations, Pointer Lock API integration for smooth and seamless mouse-look rotation, and FOV-based zoom controls. It also implements AABB (Axis-Aligned Bounding Box) collision detection to prevent the camera from clipping through the dungeon boundaries and tables.
- **`geometry.js`**: Responsible for the mathematical and parametric generation of 3D objects. It houses the algorithms that calculate the vertex data (latitude/longitude loops for the Sphere, radial/tubular segments for the Torus, and quad definitions for the Box), keeping the main rendering script decoupled from complex geometric vertex computations.

---

## Team Members

- Elif Nisa Okur
- Yunus Recepoğlu
- Zeynep Yamaç
