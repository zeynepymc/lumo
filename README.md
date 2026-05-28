# Lumos: The Hidden Chamber

**Lumos: The Hidden Chamber** is an interactive, first-person 3D WebGL experience developed for the **CENG376 – Computer Graphics** course at Gazi University. 

Built entirely from scratch using **pure WebGL (Vanilla JS) and GLSL** without the use of high-level 3D engines like Three.js. This project drops the user into a dark, atmospheric dungeon where they must use their wand to cast dynamic spells, discover magical artifacts, and interact with an independent, custom-built physics engine.

---

## ✨ Key Technical Achievements

What makes this project stand out are the underlying core computer graphics algorithms implemented from scratch:

* **Off-Screen Framebuffer Color-Picking:** Instead of relying on complex raycasting math for mouse clicks, the project uses a highly optimized hidden framebuffer. It renders the scene invisibly using pure solid colors (representing object IDs), reads the specific pixel color at the center of the screen `gl.readPixels`, and provides **100% pixel-perfect hitbox detection**.
* **Custom Physics & Collision Engine:** The environment features a custom AABB (Axis-Aligned Bounding Box) collision system. Magical objects respond to gravity when dropped and accurately collide with multi-level surfaces (e.g., the floor vs. the tables) rather than just a flat Y=0 plane.
* **Independent State Management:** Every magical object retains its own independent spell memory. You can levitate the Ring (*Wingardium Leviosa*) and leave it suspended in mid-air while simultaneously casting an aura on the Spellbook.
* **Procedural Geometry Generation:** Instead of importing `.obj` or `.gltf` files, complex 3D models (Spheres, Toruses, Books) and their respective UV mapping/Normals are generated procedurally using pure mathematics in `geometry.js`.
* **Advanced Shaders & Lighting:**
  * **Dynamic Point Light:** The *Lumos* spell acts as a dynamic light source calculated in the fragment shader, originating precisely from the wand's tip.
  * **Projectile Magic (Avada Kedavra):** A linear flying projectile that mathematically tracks its distance, emits a blinding room-wide flash, and features a gradual decay function (`Flash / Decay`).
  * **Multi-Texturing & Bump Mapping:** Surfaces utilize diffuse maps combined with normal/bump maps for realistic depth, utilizing `OES_standard_derivatives`.

---

## 🎮 Controls & Spells

The wand interaction system is highly dynamic. The controls adapt based on whether you have "locked on" to an object or not.

### Movement & Interaction
| Input | Action |
| :--- | :--- |
| **W, A, S, D** | Move around the dungeon (includes collision detection). |
| **Mouse** | Look around (Integrated with the **Pointer Lock API**). |
| **Left Click** | **Select** the object you are aiming at. Click on the wall or empty space to **drop/release** your current target. |
| **Mouse Wheel** | *If empty-handed:* Adjust the brightness of the Lumos light.<br>*If holding an object:* Scale the selected object up or down (*Engorgio/Reducio*). |

### Magical Spells (Keyboard)
| Key | Spell Name | Effect | Target Requirement |
| :---: | :--- | :--- | :--- |
| **`1`** | **Lumos** | Toggles the wand's light on and off. | *None (Global)* |
| **`2`** | **Wingardium Leviosa** | Levitates the object and makes it smoothly follow your wand's direction in mid-air using interpolation (Lerp). | *Requires Selected Object* |
| **`3`** | **Aura** | Casts a magical glowing shield around the object. | *Requires Selected Object* |
| **`4`** | **Avada Kedavra** | Shoots a flying green projectile into the dark, causing a massive room-wide flash. | *None (Global)* |
| **`F`** | **Fog** | Casts a thick, distance-based volumetric fog over the dungeon. | *None (Global)* |

---

## 🔮 The Magical Artifacts

You can find and interact with three main artifacts in the chamber:
1. **Palantir (Crystal Ball):** A reflective magical sphere that constantly rotates to track the player's position.
2. **The Runed Ring:** A metallic torus-shaped golden ring covered in ancient runes, utilizing dense UV mapping.
3. **The Spellbook:** A textured magical book that hovers and rotates along multiple axes when levitated.

---

## 🚀 How to Run the Project

This project uses **Vite** as a modern frontend build tool for fast hot-module replacement (HMR) and optimized builds.

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) installed on your machine.

### Installation Steps
1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd <project-folder>

2. **Install dependencies:**
   ```bash
   npm install

3. **Start the development server:**
   ```bash
   npm run dev

4. **Enter the Chamber:**
   Open your browser and navigate to the local server URL provided in your terminal (usually http://localhost:5173). Click anywhere on the canvas to lock your pointer and begin!

## Project Architecture & Modules

To ensure scalability, readability, and a clean separation of concerns, the codebase is structured using ES Modules. The core logic is divided into three primary scripts:

- **`src/main.js:`**: The beating heart of the project. Manages WebGL initialization, shader compilation, the rendering loop, the Framebuffer picking system, texture loading, and the core physics/collision engine.
- **`src/camera.js:`**: Encapsulates the first-person camera logic. Handles view matrix calculations, Pointer Lock integration, and player boundary constraints.
- **`src/geometry.js`**:The procedural generation factory. Generates vertices, normals, and UV coordinates for 3D shapes algorithmically.
- **`src/Common/:`**:Contains foundational matrix/vector math libraries (MV.js) and WebGL utilities.
- **`src/style.css:`**:Manages the HUD, UI overlay, the dynamic crosshair, and atmospheric vignette effects.
---

## Team Members

- Elif Nisa Okur
- Yunus Recepoğlu
- Zeynep Yamaç
