// ==========================================
// --- KAMERA VE KONTROL MODÜLÜ (V4 - Pointer Lock) ---
// ==========================================

export const camera = {
  eye: vec3(0.0, 4.5, 5.0),
  yaw: -90.0,
  pitch: 0.0,
  fov: 60.0,
  speed: 0.25,
  keys: { w: false, a: false, s: false, d: false, "+": false, "-": false },
};

export function setupControls(canvas) {
  // ==========================================
  // --- YENİ: POINTER LOCK BAKIŞ SİSTEMİ ---
  // ==========================================

  // Ekrana tıklandığında fare imlecini gizle ve canvas'a kilitle
  canvas.addEventListener("click", () => {
    canvas.requestPointerLock =
      canvas.requestPointerLock || canvas.mozRequestPointerLock;
    canvas.requestPointerLock();
  });

  // Sadece fare kilitliyken (oyunun içindeyken) kamerayı döndür
  document.addEventListener("mousemove", (e) => {
    if (
      document.pointerLockElement === canvas ||
      document.mozPointerLockElement === canvas
    ) {
      // Tarayıcının verdiği saf hareket deltasını (movementX/Y) kullanıyoruz
      // Bu sayede imleç ekran kenarına takılmaz, sıfır lag olur.
      const sensitivity = 0.25;
      camera.yaw += e.movementX * sensitivity;
      camera.pitch -= e.movementY * sensitivity;

      // Boynumuzun kırılmasını engelleme
      if (camera.pitch > 89.0) camera.pitch = 89.0;
      if (camera.pitch < -89.0) camera.pitch = -89.0;
    }
  });

  // --- KLAVYE GİRİŞLERİ (WASD & ZOOM) ---
  window.addEventListener("keydown", (e) => {
    const key = e.key.toLowerCase();
    if (camera.keys.hasOwnProperty(key)) camera.keys[key] = true;
    if (e.key === "+" || e.key === "=") camera.keys["+"] = true;
    if (e.key === "-") camera.keys["-"] = true;
  });

  window.addEventListener("keyup", (e) => {
    const key = e.key.toLowerCase();
    if (camera.keys.hasOwnProperty(key)) camera.keys[key] = false;
    if (e.key === "+" || e.key === "=") camera.keys["+"] = false;
    if (e.key === "-") camera.keys["-"] = false;
  });

  // --- FARE TEKERLEĞİ İLE LUMOS ŞİDDETİ ---
  // Zoom yerine ışık parlaklığını kontrol ediyoruz. main.js bu olayı dinler.
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      window.dispatchEvent(
        new CustomEvent("lumos-wheel", { detail: { deltaY: e.deltaY } }),
      );
    },
    { passive: false },
  );
}

// Çarpışma (Sliding Collision) Çözücü
function resolveTableCollision(x, z, cx, cz, hw, hd, r) {
  let minX = cx - hw - r;
  let maxX = cx + hw + r;
  let minZ = cz - hd - r;
  let maxZ = cz + hd + r;

  if (x > minX && x < maxX && z > minZ && z < maxZ) {
    let dl = x - minX;
    let dr = maxX - x;
    let dt = z - minZ;
    let db = maxZ - z;

    let min = Math.min(dl, dr, dt, db);
    if (min === dl) return [minX, z];
    if (min === dr) return [maxX, z];
    if (min === dt) return [x, minZ];
    if (min === db) return [x, maxZ];
  }
  return [x, z];
}

export function updateCamera() {
  if (camera.keys["+"]) camera.fov -= 1.5;
  if (camera.keys["-"]) camera.fov += 1.5;
  if (camera.fov < 30.0) camera.fov = 30.0;
  if (camera.fov > 100.0) camera.fov = 100.0;

  let dirX = Math.cos(radians(camera.yaw)) * Math.cos(radians(camera.pitch));
  let dirY = Math.sin(radians(camera.pitch));
  let dirZ = Math.sin(radians(camera.yaw)) * Math.cos(radians(camera.pitch));

  let forward = normalize(vec3(dirX, 0.0, dirZ));
  let up = vec3(0.0, 1.0, 0.0);
  let right = normalize(cross(forward, up));

  // Hareket Uygulama
  if (camera.keys.w) {
    camera.eye[0] += forward[0] * camera.speed;
    camera.eye[2] += forward[2] * camera.speed;
  }
  if (camera.keys.s) {
    camera.eye[0] -= forward[0] * camera.speed;
    camera.eye[2] -= forward[2] * camera.speed;
  }
  if (camera.keys.a) {
    camera.eye[0] -= right[0] * camera.speed;
    camera.eye[2] -= right[2] * camera.speed;
  }
  if (camera.keys.d) {
    camera.eye[0] += right[0] * camera.speed;
    camera.eye[2] += right[2] * camera.speed;
  }

  // Masa Çarpışmaları (3.5 / 2 = 1.75)
  const hw = 1.75,
    hd = 1.75,
    pr = 0.8;
  let res = resolveTableCollision(
    camera.eye[0],
    camera.eye[2],
    0.0,
    -10.25,
    hw,
    hd,
    pr,
  );
  camera.eye[0] = res[0];
  camera.eye[2] = res[1];

  res = resolveTableCollision(
    camera.eye[0],
    camera.eye[2],
    -10.25,
    0.0,
    hw,
    hd,
    pr,
  );
  camera.eye[0] = res[0];
  camera.eye[2] = res[1];

  res = resolveTableCollision(
    camera.eye[0],
    camera.eye[2],
    10.25,
    0.0,
    hw,
    hd,
    pr,
  );
  camera.eye[0] = res[0];
  camera.eye[2] = res[1];

  // Dış Duvar Sınırları
  const roomSize = 12.0;
  const boundary = roomSize - pr;

  if (camera.eye[0] > boundary) camera.eye[0] = boundary;
  if (camera.eye[0] < -boundary) camera.eye[0] = -boundary;
  if (camera.eye[2] > boundary) camera.eye[2] = boundary;
  if (camera.eye[2] < -boundary) camera.eye[2] = -boundary;

  camera.eye[1] = 4.5; // Yükseklik Sabit

  let direction = normalize(vec3(dirX, dirY, dirZ));
  let at = add(camera.eye, direction);

  return {
    viewMatrix: lookAt(camera.eye, at, up),
    fov: camera.fov,
    eye: vec3(camera.eye[0], camera.eye[1], camera.eye[2]),
    direction: vec3(direction[0], direction[1], direction[2]),
  };
}
