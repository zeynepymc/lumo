import "./style.css";
import { setupControls, updateCamera } from "./camera.js";
// Yeni geometri ürettiğimiz modülü içe aktarıyoruz
import { generateSphere, generateTorus, generateBook } from "./geometry.js";

const app = document.querySelector("#app");
app.innerHTML = `
  <canvas id="glCanvas"></canvas>
  <div id="lumosOverlay" aria-hidden="true">
    <div class="lumos-vignette"></div>
    <div class="lumos-halo"></div>
    <div class="lumos-core"></div>
    <div class="robe-silhouette"></div>
    <div class="wand-overlay">
      <span class="wand-handle"></span>
      <span class="wand-shaft"></span>
      <span class="wand-tip"></span>
    </div>
  </div>
  <div id="ui">
    <h1>Lumos: The Hidden Chamber</h1>
    <p>Lumos asanın ucundan çıkar ve baktığın yeri aydınlatır.</p>
    <p class="hint">1: Lumos aç/kapat &nbsp; | &nbsp; Fare tekerleği: parlaklık</p>
    <div id="lumos-control">
      <label for="lumosSlider">Lumos Şiddeti: <span id="lumosValue">1.50</span> <span id="lumosStatus">Açık</span></label>
      <input id="lumosSlider" type="range" min="0" max="3" step="0.05" value="1.5" />
    </div>
  </div>
`;

let gl, program, canvas;
let projectionMatrixLoc, viewMatrixLoc, modelMatrixLoc, colorLoc, vPosition, vNormal;
let lightPositionLoc, cameraPositionLoc, lightColorLoc, lightDirectionLoc, lightIntensityLoc;
let innerCutoffLoc, outerCutoffLoc;
let useLightingLoc, shininessLoc, specularStrengthLoc;
let lumosEnabled = true;
let lumosIntensity = 1.5;          // Kullanıcının seçtiği hedef parlaklık
let currentLumosIntensity = 1.5;   // Shader ve görsel efektin yumuşatılmış gerçek değeri
const MIN_LUMOS_INTENSITY = 0.0;
const MAX_LUMOS_INTENSITY = 3.0;
let avadaKedavraFlash = 0.0; // Yeşil ışık patlamasının sönümleme sayacı
// --- YENİ: FIRLATILAN BÜYÜ (PROJEKTİL) DEĞİŞKENLERİ ---
let akActive = false;      // Büyü havada uçuyor mu?
let akPos = vec3(0,0,0);   // Büyünün başlangıç noktası (Asanın ucu)
let akDir = vec3(0,0,0);   // Büyünün gidiş yönü (Kameranın baktığı yer)
let akDistance = 0.0;      // Büyünün ne kadar uzağa gittiği

let uBumpMapLoc, uHasBumpMapLoc; // Profesyonel Çoklu Dokulama Kanalları
let wallDiffuse, wallBump, stoneDiffuse, stoneBump, glassBump;
let uIsMagicLoc, uIsRingLoc, uIsPalantirLoc;

// Ortam Buffer'ları
let floorBuffer,
  wallBuffer,
  windowBuffer,
  doorBuffer,
  torchBuffer,
  ironBuffer,
  tableBuffer,
  floorNormalBuffer,
  wallNormalBuffer,
  windowNormalBuffer,
  doorNormalBuffer,
  torchNormalBuffer,
  ironNormalBuffer,
  tableNormalBuffer;
let numWallVertices = 0,
  numWindowVertices = 0,
  numDoorVertices = 0,
  numTorchVertices = 0,
  numIronVertices = 0,
  numTableVertices = 0;

// YENİ: Obje Buffer'ları
let palantirBuffer, ringBuffer, bookBuffer;
let palantirNormalBuffer, ringNormalBuffer, bookNormalBuffer;
let wandTipBuffer, wandTipNormalBuffer;
let numPalantirVertices = 0,
  numRingVertices = 0,
  numBookVertices = 0,
  numWandTipVertices = 0;

  // --- YENİ EKLENEN DEĞİŞKENLER ---
// Shader bağlantıları
let vTexCoord, uTextureLoc, uHasTextureLoc, uRenderModeLoc, uPickingColorLoc, uSpellModeLoc;

// Büyü ve Etkileşim Durumları (State Management)
let selectedObject = 0; // 0: Hiçbiri, 1: Palantir, 2: Yüzük, 3: Kitap
let activeSpellMode = 0; // 0: Yok, 1: Aura, 2: Sis (F tuşu)
let animationTime = 0.0; // Levitasyon ve Dönüş için sayaç
let objScales = { 1: 1.0, 2: 1.0, 3: 1.0 }; 
let isPicking = false; // YENİ EKLENEN KİLİT
let objPositions = { // Telekinezi ve Levitasyon için XYZ konumları
  1: { x: 0.0, y: 3.0, z: -10.25 },
  2: { x: -10.25, y: 3.0, z: 0.0 },
  3: { x: 10.25, y: 3.0, z: 0.0 }
};
let uTimeLoc; // Nefes alan ateş efekti için zaman sayacı

// Texture Buffer'ları
let palantirTexBuffer, ringTexBuffer, bookTexBuffer;
let palantirTexture, ringTexture, bookTexture;

let frameBuffer, frameNormalBuffer, frameTexBuffer;
let numFrameVertices = 0;

// YENİ: Zindan Duvarları, Zemin ve Kapı
let floorTexture, wallTexture;
let floorTexBuffer, wallTexBuffer;
let doorTexture, doorTexBuffer;
// YENİ: Masa, Cam, Demir ve Meşale için Doku (UV) Buffer'ları
let tableTexBuffer, windowTexBuffer, ironTexBuffer, torchTexBuffer;
let floorDiffuse, floorBump;
let doorDiffuse, doorBump; // İri ve düzensiz kayalardan oluşan kapı

// Yardımcı Fonksiyon: Boyutlar 2'nin kuvveti mi kontrolü
function isPowerOf2(value) {
  return (value & (value - 1)) == 0;
}

// Yardımcı Fonksiyon: Akıllı Doku (Texture) Yükleme
function loadTexture(imageSrc) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  
  // ÖNEMLİ: Resim internetten/klasörden yüklenene kadar objeyi geçici olarak 
  // koyu gri bir pikselle kapla. (Siyah patlama ve çökmeleri %100 engeller)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([50, 50, 50, 255]));

  const image = new Image();
  image.crossOrigin = "anonymous"; 
  
  image.onload = function() {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    
    // AKILLI KONTROL: Resim boyutları 2'nin kuvveti mi?
    if (isPowerOf2(image.width) && isPowerOf2(image.height)) {
       // 2'nin kuvvetiyse: Duvarlar ve zemin için Tekrar Et (REPEAT)
       gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
       gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
       gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
       gl.generateMipmap(gl.TEXTURE_2D);
    } else {
       // 2'nin kuvveti DEĞİLSE: Rastgele boyutlu objeler için Kenara Sabitle (CLAMP_TO_EDGE)
       // (İşte siyah ekran hatasını çözen kısım burası!)
       gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
       gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
       gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    }
  };
  image.src = imageSrc;
  return texture;
}

function makeBuffer(data) {
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, flatten(data), gl.STATIC_DRAW);
  return buffer;
}

function makeNormalData(vertices) {
  const normals = [];
  for (let i = 0; i + 2 < vertices.length; i += 3) {
    const p1 = vec3(vertices[i][0], vertices[i][1], vertices[i][2]);
    const p2 = vec3(vertices[i + 1][0], vertices[i + 1][1], vertices[i + 1][2]);
    const p3 = vec3(vertices[i + 2][0], vertices[i + 2][1], vertices[i + 2][2]);
    const u = subtract(p2, p1);
    const v = subtract(p3, p1);
    let n = cross(u, v);
    if (length(n) === 0) n = vec3(0.0, 1.0, 0.0);
    else n = normalize(n);
    normals.push(n, n, n);
  }
  while (normals.length < vertices.length) normals.push(vec3(0.0, 1.0, 0.0));
  return normals;
}

function generateTaperedCylinder(zStart, zEnd, radiusStart, radiusEnd, segments = 24) {
  const vertices = [];
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2.0;
    const a1 = ((i + 1) / segments) * Math.PI * 2.0;

    const p1 = vec4(Math.cos(a0) * radiusStart, Math.sin(a0) * radiusStart, zStart, 1.0);
    const p2 = vec4(Math.cos(a1) * radiusStart, Math.sin(a1) * radiusStart, zStart, 1.0);
    const p3 = vec4(Math.cos(a1) * radiusEnd, Math.sin(a1) * radiusEnd, zEnd, 1.0);
    const p4 = vec4(Math.cos(a0) * radiusEnd, Math.sin(a0) * radiusEnd, zEnd, 1.0);

    vertices.push(p1, p2, p3, p1, p3, p4);
  }
  return vertices;
}

function generateLightBeam(length = 9.0, startRadius = 0.05, endRadius = 1.45, segments = 36) {
  const vertices = [];
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2.0;
    const a1 = ((i + 1) / segments) * Math.PI * 2.0;
    const p1 = vec4(Math.cos(a0) * startRadius, Math.sin(a0) * startRadius, 0.0, 1.0);
    const p2 = vec4(Math.cos(a1) * startRadius, Math.sin(a1) * startRadius, 0.0, 1.0);
    const p3 = vec4(Math.cos(a1) * endRadius, Math.sin(a1) * endRadius, length, 1.0);
    const p4 = vec4(Math.cos(a0) * endRadius, Math.sin(a0) * endRadius, length, 1.0);
    vertices.push(p1, p2, p3, p1, p3, p4);
  }
  return vertices;
}


function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function setLumosIntensity(value) {
  lumosIntensity = clamp(value, MIN_LUMOS_INTENSITY, MAX_LUMOS_INTENSITY);
  const lumosSlider = document.getElementById("lumosSlider");
  const lumosValue = document.getElementById("lumosValue");
  if (lumosSlider) lumosSlider.value = lumosIntensity.toFixed(2);
  if (lumosValue) lumosValue.textContent = lumosIntensity.toFixed(2);
}

function toggleLumos() {
  lumosEnabled = !lumosEnabled;
  const overlay = document.getElementById("lumosOverlay");
  if (overlay) {
    overlay.classList.toggle("lumos-off", !lumosEnabled);
    // Açılırken kısa bir büyü tutuşması hissi veriyoruz.
    if (lumosEnabled) {
      overlay.classList.remove("lumos-casting");
      void overlay.offsetWidth;
      overlay.classList.add("lumos-casting");
    }
  }
  updateLumosUI();
}

function updateLumosUI() {
  const lumosStatus = document.getElementById("lumosStatus");
  if (lumosStatus) {
    lumosStatus.textContent = lumosEnabled ? "Açık" : "Kapalı";
    lumosStatus.className = lumosEnabled ? "status-on" : "status-off";
  }
}

function updateLumosState() {
  const target = lumosEnabled ? lumosIntensity : 0.0;
  // Büyü bir anda yanıp sönmesin; ışık yumuşakça açılsın/kısılsın.
  currentLumosIntensity += (target - currentLumosIntensity) * 0.085;
  updateLumosOverlay();
}

function updateLumosOverlay() {
  const overlay = document.getElementById("lumosOverlay");
  if (!overlay) return;
  const power = clamp(currentLumosIntensity / MAX_LUMOS_INTENSITY, 0.0, 1.0);
  overlay.style.setProperty("--lumos-power", power.toFixed(3));
  overlay.style.setProperty("--lumos-glow", (0.35 + power * 0.65).toFixed(3));
  overlay.classList.toggle("lumos-off", power < 0.025);
}

function createCameraAttachedModel(camData, offsetRight, offsetUp, offsetForward, scaleRight, scaleUp, scaleForward) {
  const worldUp = vec3(0.0, 1.0, 0.0);
  const forward = normalize(camData.direction);
  const right = normalize(cross(forward, worldUp));
  const up = normalize(cross(right, forward));
  const center = add(
    add(add(camData.eye, scale(offsetRight, right)), scale(offsetUp, up)),
    scale(offsetForward, forward),
  );

  return mat4(
    vec4(right[0] * scaleRight, up[0] * scaleUp, forward[0] * scaleForward, center[0]),
    vec4(right[1] * scaleRight, up[1] * scaleUp, forward[1] * scaleForward, center[1]),
    vec4(right[2] * scaleRight, up[2] * scaleUp, forward[2] * scaleForward, center[2]),
    vec4(0.0, 0.0, 0.0, 1.0),
  );
}

function getWandTipPosition(camData) {
  const worldUp = vec3(0.0, 1.0, 0.0);
  const forward = normalize(camData.direction);
  const right = normalize(cross(forward, worldUp));
  const up = normalize(cross(right, forward));

  // Sağ el POV: ışık gerçek dünyada kameranın sağ-alt önünden çıkar,
  // yönü ise kameranın baktığı doğrultuda kalır.
  return add(
    add(add(camData.eye, scale(0.30, right)), scale(-0.20, up)),
    scale(0.78, forward),
  );
}
function drawShape(buffer, normalBuffer, vertexCount, color, modelMatrix, options = {}) {
  gl.uniformMatrix4fv(modelMatrixLoc, false, flatten(modelMatrix));
  gl.uniform4fv(colorLoc, flatten(color));
  gl.uniform1i(uHasTextureLoc, 0); 
  gl.disableVertexAttribArray(vTexCoord);
  gl.uniform4fv(uPickingColorLoc, flatten(options.pickingColor || vec4(0.0, 0.0, 0.0, 1.0)));
  // Gizli seçim ekranındaysak ışıkları ZORLA kapalı tut (Kusursuz renk algılama için)
  if (isPicking) {
      gl.uniform1i(useLightingLoc, 0);
  } else {
      gl.uniform1i(useLightingLoc, options.useLighting === false ? 0 : 1);
  }
  gl.uniform1f(shininessLoc, options.shininess || 32.0);
  gl.uniform1f(specularStrengthLoc, options.specularStrength || 0.35);
  gl.uniform1i(uIsMagicLoc, options.isMagic ? 1 : 0); // YENİ: KORUMA KALKANI AÇIK/KAPALI
  gl.uniform1i(uIsRingLoc, options.isRing ? 1 : 0); // YENİ: Rün kalkanı
  gl.uniform1i(uIsPalantirLoc, options.isPalantir ? 1 : 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.vertexAttribPointer(vPosition, 4, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
  gl.vertexAttribPointer(vNormal, 3, gl.FLOAT, false, 0, 0);
  gl.drawArrays(options.mode || gl.TRIANGLES, options.first || 0, vertexCount);
}
// YARDIMCI FONKSİYON: 3D Objeleri Otomatik Kaplama (Prosedürel UV)
function generateWorldUVs(vertices, scale) {
  let uvs = [];
  for (let i = 0; i < vertices.length; i++) {
    // Objenin dünyadaki fiziksel büyüklüğüne göre dokuyu esnetir
    uvs.push(vec2((vertices[i][0] + vertices[i][2]) * scale, vertices[i][1] * scale));
  }
  return uvs;
}

window.onload = function init() {
  canvas = document.getElementById("glCanvas");
  gl = WebGLUtils.setupWebGL(canvas);
  if (!gl) {
    alert("WebGL is not available");
    return;
  }

  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);
  setupControls(canvas);

  gl.clearColor(0.05, 0.05, 0.08, 1.0);
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  program = initShaders(gl, "vertex-shader", "fragment-shader");
  gl.useProgram(program);
  // Donanım hızlandırmalı türev matematiğini açıyoruz
  gl.getExtension("OES_standard_derivatives"); 

  uIsMagicLoc = gl.getUniformLocation(program, "uIsMagic");
  uIsRingLoc = gl.getUniformLocation(program, "uIsRing");
  uIsPalantirLoc = gl.getUniformLocation(program, "uIsPalantir");
  
  uBumpMapLoc = gl.getUniformLocation(program, "uBumpMap");
  uHasBumpMapLoc = gl.getUniformLocation(program, "uHasBumpMap");

 // --- ZEYNEP: BİZİM YENİ EKLENEN SHADER BAĞLANTILARIMIZ ---
  vTexCoord = gl.getAttribLocation(program, "vTexCoord");
  uTextureLoc = gl.getUniformLocation(program, "uTexture");
  uHasTextureLoc = gl.getUniformLocation(program, "uHasTexture");
  uRenderModeLoc = gl.getUniformLocation(program, "uRenderMode");
  uPickingColorLoc = gl.getUniformLocation(program, "uPickingColor");
  uSpellModeLoc = gl.getUniformLocation(program, "uSpellMode");
  uTimeLoc = gl.getUniformLocation(program, "uTime");
  // --------------------------------------------------------

  // --- ESKİ DEĞİŞKENLER (TEKRAR EDENLER SİLİNDİ) ---
  vPosition = gl.getAttribLocation(program, "vPosition");
  vNormal = gl.getAttribLocation(program, "vNormal");
  modelMatrixLoc = gl.getUniformLocation(program, "modelMatrix");
  viewMatrixLoc = gl.getUniformLocation(program, "viewMatrix");
  projectionMatrixLoc = gl.getUniformLocation(program, "projectionMatrix");
  colorLoc = gl.getUniformLocation(program, "fColor");
  lightPositionLoc = gl.getUniformLocation(program, "lightPosition");
  cameraPositionLoc = gl.getUniformLocation(program, "cameraPosition");
  lightColorLoc = gl.getUniformLocation(program, "lightColor");
  lightDirectionLoc = gl.getUniformLocation(program, "lightDirection");
  lightIntensityLoc = gl.getUniformLocation(program, "lightIntensity");
  innerCutoffLoc = gl.getUniformLocation(program, "innerCutoff");
  outerCutoffLoc = gl.getUniformLocation(program, "outerCutoff");
  useLightingLoc = gl.getUniformLocation(program, "useLighting");
  shininessLoc = gl.getUniformLocation(program, "shininess");
  specularStrengthLoc = gl.getUniformLocation(program, "specularStrength");

  const lumosSlider = document.getElementById("lumosSlider");
  lumosSlider.addEventListener("input", () => {
    setLumosIntensity(parseFloat(lumosSlider.value));
  });

  // ==========================================
  // ASANIN BÜYÜ KONTROLLERİ (KLAVYE)
  // ==========================================
  window.addEventListener("keydown", (e) => {
    if (e.repeat) return; // Tuşa basılı tutulduğunda spam olmasını engeller
    const key = e.key.toLowerCase();
    
    // 1: Lumos (Işık Aç/Kapat)
    if (key === "1") toggleLumos();
    
    // 2: Wingardium Leviosa (Objeyi Havaya Kaldır / Asanın ucunda uçur)
    if (key === "2") activeSpellMode = activeSpellMode === 2 ? 0 : 2; 
    
    // 3: Aura Parlaması (Seçili obje sihirli bir aurayla parlar)
    if (key === "3") activeSpellMode = activeSpellMode === 1 ? 0 : 1;

    // 4 (Avada Kedavra) -> Çizgisel yeşil laneti fırlat!
    if (key === "4" && !akActive) {
        const cam = updateCamera(); 
        akPos = getWandTipPosition(cam); // Büyü tam asanın ucundan çıkar
        akDir = normalize(cam.direction); // Büyü kameranın baktığı yöne gider
        akActive = true;
        akDistance = 0.0;
        avadaKedavraFlash = 1.0; // Fırlatma anında odayı anlık yeşil aydınlatır
    }
    
    // F: Zindan Sisi (Uzakları kör eden kalın sis büyüsü)
    if (key === "f") activeSpellMode = activeSpellMode === 3 ? 0 : 3;
  });

  window.addEventListener("lumos-wheel", (e) => {
    if (selectedObject !== 0) {
        // Obje seçili: Büyüme/Küçülme (Reducio/Engorgio)
        const delta = e.detail.deltaY < 0 ? 0.15 : -0.15;
        objScales[selectedObject] = clamp(objScales[selectedObject] + delta, 0.3, 1.5);
    } else {
        // Obje seçili değil: Lumos parlaklığını ayarla
        const delta = e.detail.deltaY < 0 ? 0.12 : -0.12;
        setLumosIntensity(lumosIntensity + delta);
    }
  });
  updateLumosUI();
  updateLumosOverlay();

  // ==========================================
  // --- PROFESYONEL DOKULARI İNDİRİYORUZ (RENK VE KABARTMA AYRI) ---
  // ==========================================
  
  wallDiffuse = loadTexture("https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/brick_diffuse.jpg");
  wallBump = loadTexture("https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/brick_bump.jpg");
  
  // Zemin ve Tavan için efsanevi kraterli antik taş dokusu
  floorDiffuse = loadTexture("https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/moon_1024.jpg");
  floorBump = loadTexture("https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/moon_1024.jpg");

  // Kapı için düzensiz, iri kayalardan oluşan yeni doku
  doorDiffuse = loadTexture("https://raw.githubusercontent.com/BabylonJS/Babylon.js/master/packages/tools/playground/public/textures/rock.png");
  doorBump = loadTexture("https://raw.githubusercontent.com/BabylonJS/Babylon.js/master/packages/tools/playground/public/textures/rock.png");

  stoneDiffuse = loadTexture("https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/terrain/backgrounddetailed6.jpg");
  stoneBump = loadTexture("https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/terrain/backgrounddetailed6.jpg"); 
  
  glassBump = loadTexture("https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/waternormals.jpg");

const floorSize = 12.0;
  const wallHeight = 10.0;

 // --- ZEMİN VE TAVAN (Kusursuzlaştırılmış UV) ---
  let floorVertices = [];
  let floorTexCoords = [];
  function addFloorQuad(x1, y1, z1, x2, y2, z2, x3, y3, z3, x4, y4, z4, repeat) {
    floorVertices.push(vec4(x1,y1,z1,1.0), vec4(x2,y2,z2,1.0), vec4(x3,y3,z3,1.0), vec4(x1,y1,z1,1.0), vec4(x3,y3,z3,1.0), vec4(x4,y4,z4,1.0));
    floorTexCoords.push(vec2(0,0), vec2(repeat,0), vec2(repeat,repeat), vec2(0,0), vec2(repeat,repeat), vec2(0,repeat));
  }
  // Zemin ve tavan tekrar sayısı 6.0'a çekildi!
  addFloorQuad(-floorSize, 0.0, floorSize, floorSize, 0.0, floorSize, floorSize, 0.0, -floorSize, -floorSize, 0.0, -floorSize, 6.0);
  addFloorQuad(-floorSize, wallHeight, -floorSize, floorSize, wallHeight, -floorSize, floorSize, wallHeight, floorSize, -floorSize, wallHeight, floorSize, 6.0);
  
  floorBuffer = makeBuffer(floorVertices);
  floorNormalBuffer = makeBuffer(makeNormalData(floorVertices));
  floorTexBuffer = makeBuffer(floorTexCoords);

// --- DUVARLAR (Kusursuz Normaller ve CCW Yönü) ---
  let wallVertices = [];
  let wallTexCoords = [];
  let wallNormals = []; // YENİ: Işık yönü odaya kilitlendi!
  function addWall(isZWall, fixedPos, wallType) {
    let nx = 0.0, nz = 0.0;
    if (isZWall) nz = (fixedPos < 0) ? 1.0 : -1.0; 
    else nx = (fixedPos < 0) ? 1.0 : -1.0;
    let n = vec3(nx, 0.0, nz);

    function addQuadDirect(x1, y1, x2, y2, x3, y3, x4, y4) {
      let p1, p2, p3, p4;
      let scale = 0.4; 
      let t1 = vec2(x1*scale, y1*scale), t2 = vec2(x2*scale, y2*scale), t3 = vec2(x3*scale, y3*scale), t4 = vec2(x4*scale, y4*scale);
      if (isZWall) { p1 = vec4(x1,y1,fixedPos,1.0); p2 = vec4(x2,y2,fixedPos,1.0); p3 = vec4(x3,y3,fixedPos,1.0); p4 = vec4(x4,y4,fixedPos,1.0);
      } else { p1 = vec4(fixedPos,y1,x1,1.0); p2 = vec4(fixedPos,y2,x2,1.0); p3 = vec4(fixedPos,y3,x3,1.0); p4 = vec4(fixedPos,y4,x4,1.0); }
      
      wallVertices.push(p1, p2, p3, p3, p2, p4); 
      wallTexCoords.push(t1, t2, t3, t3, t2, t4);
      wallNormals.push(n, n, n, n, n, n); 
    }
    function addArchFiller(centerX) {
      const r = 1.5, archBaseY = 6.0, segments = 20;
      for (let i = 0; i < segments; i++) {
        let a1 = Math.PI - (i * Math.PI) / segments; let a2 = Math.PI - ((i + 1) * Math.PI) / segments;
        addQuadDirect(centerX + r * Math.cos(a1), archBaseY + r * Math.sin(a1), centerX + r * Math.cos(a2), archBaseY + r * Math.sin(a2), centerX + r * Math.cos(a1), 10.0, centerX + r * Math.cos(a2), 10.0);
      }
    }
    if (wallType === "window") {
      addQuadDirect(-floorSize, 0.0, -7.5, 0.0, -floorSize, 10.0, -7.5, 10.0);
      addQuadDirect(-4.5, 0.0, 4.5, 0.0, -4.5, 10.0, 4.5, 10.0);
      addQuadDirect(7.5, 0.0, floorSize, 0.0, 7.5, 10.0, floorSize, 10.0);
      addArchFiller(-6.0); addArchFiller(6.0);
    } else if (wallType === "door") {
      addQuadDirect(-floorSize, 0.0, -1.5, 0.0, -floorSize, 10.0, -1.5, 10.0);
      addQuadDirect(1.5, 0.0, floorSize, 0.0, 1.5, 10.0, floorSize, 10.0);
      addQuadDirect(-1.5, 7.5, 1.5, 7.5, -1.5, 10.0, 1.5, 10.0);
      addArchFiller(0.0);
    } else {
      addQuadDirect(-floorSize, 0.0, floorSize, 0.0, -floorSize, 10.0, floorSize, 10.0);
    }
  }
  addWall(true, -floorSize, "window"); addWall(false, -floorSize, "window"); addWall(true, floorSize, "door"); addWall(false, floorSize, "window");
  numWallVertices = wallVertices.length;
  wallBuffer = makeBuffer(wallVertices);
  wallNormalBuffer = makeBuffer(wallNormals);
  wallTexBuffer = makeBuffer(wallTexCoords);

  // --- YERE KADAR İNEN PENCERELER (CAM) ---
  let windowVertices = [];
  let windowNormals = [];
  function addGlass(isZWall, fixedPos, centerX) {
    let nx = 0.0, nz = 0.0;
    if (isZWall) nz = (fixedPos < 0) ? 1.0 : -1.0; 
    else nx = (fixedPos < 0) ? 1.0 : -1.0;
    let n = vec3(nx, 0.0, nz);

    const r = 1.5, archBaseY = 6.0, segments = 20; const zPos = fixedPos + (fixedPos < 0 ? 0.02 : -0.02); const x1 = centerX - 1.5, x2 = centerX + 1.5;
    
    function pushPtN(p1, p2, p3) {
      windowVertices.push(p1, p2, p3);
      windowNormals.push(n, n, n);
    }

    let p1 = isZWall ? vec4(x1, 0.0, zPos, 1.0) : vec4(zPos, 0.0, x1, 1.0);
    let p2 = isZWall ? vec4(x2, 0.0, zPos, 1.0) : vec4(zPos, 0.0, x2, 1.0);
    let p3 = isZWall ? vec4(x1, archBaseY, zPos, 1.0) : vec4(zPos, archBaseY, x1, 1.0);
    let p4 = isZWall ? vec4(x2, archBaseY, zPos, 1.0) : vec4(zPos, archBaseY, x2, 1.0);
    
    pushPtN(p1, p2, p3);
    pushPtN(p3, p2, p4);

    for (let i = 0; i < segments; i++) {
      let cx1 = centerX; let cy1 = archBaseY;
      let cx2 = centerX + r * Math.cos(Math.PI - (i * Math.PI) / segments); let cy2 = archBaseY + r * Math.sin(Math.PI - (i * Math.PI) / segments);
      let cx3 = centerX + r * Math.cos(Math.PI - ((i + 1) * Math.PI) / segments); let cy3 = archBaseY + r * Math.sin(Math.PI - ((i + 1) * Math.PI) / segments);
      
      let pC = isZWall ? vec4(cx1, cy1, zPos, 1.0) : vec4(zPos, cy1, cx1, 1.0);
      let pL = isZWall ? vec4(cx2, cy2, zPos, 1.0) : vec4(zPos, cy2, cx2, 1.0);
      let pR = isZWall ? vec4(cx3, cy3, zPos, 1.0) : vec4(zPos, cy3, cx3, 1.0);
      
      pushPtN(pC, pR, pL); // CCW Kemer Yönü Düzeltmesi!
    }
  }
  addGlass(true, -floorSize, -6.0); addGlass(true, -floorSize, 6.0); addGlass(false, -floorSize, -6.0); addGlass(false, -floorSize, 6.0); addGlass(false, floorSize, -6.0); addGlass(false, floorSize, 6.0);
  numWindowVertices = windowVertices.length;
  windowBuffer = makeBuffer(windowVertices);
  windowNormalBuffer = makeBuffer(windowNormals);
  windowTexBuffer = makeBuffer(generateWorldUVs(windowVertices, 0.3));

// --- YENİ: TAM 3 BOYUTLU KALIN ÇERÇEVE SÜTUNLARI ---
  let frameVertices = [];
  let frameTexCoords = [];
  let frameNormals = [];

  function addFrame(isZWall, fixedPos, centerX) {
    let depth = 0.5; // DÜZELTME: 0.08'den 0.5'e çıkarıldı! Artık kağıt gibi değil, devasa 3D taş sütun!
    let zF = fixedPos + (fixedPos < 0 ? depth : -depth); // Sütunun en ön yüzü
    let zB = fixedPos + (fixedPos < 0 ? 0.02 : -0.02);   // Sütunun duvara gömülü arka yüzü
    let uvScale = 0.5;

    let zDir = fixedPos < 0 ? 1.0 : -1.0;
    let nFront = isZWall ? vec3(0, 0, zDir) : vec3(zDir, 0, 0);

    // Otomatik normal ve yüzey oluşturucu
    function pushQ(p1, p2, p3, p4, n, t1, t2, t3, t4) {
      frameVertices.push(p1, p2, p3, p3, p2, p4);
      frameTexCoords.push(t1, t2, t3, t3, t2, t4);
      frameNormals.push(n, n, n, n, n, n); // Işık her zaman %100 kusursuz hesaplanacak
    }
    
    function pt(x, y, z) { return isZWall ? vec4(x, y, z, 1.0) : vec4(z, y, x, 1.0); }
    function norm(nx, ny, nz) { return isZWall ? vec3(nx, ny, nz) : vec3(nz, ny, nx); }

    function addBlock(x1, x2, y1, y2) { 
      // 1. Sütunun Ön Yüzü
      pushQ(pt(x1,y1,zF), pt(x2,y1,zF), pt(x1,y2,zF), pt(x2,y2,zF), nFront, 
            vec2(x1*uvScale, y1*uvScale), vec2(x2*uvScale, y1*uvScale), vec2(x1*uvScale, y2*uvScale), vec2(x2*uvScale, y2*uvScale));
      // 2. Sütunun Sağ Yan Yüzü (Kalınlığı veren 3D hacim)
      pushQ(pt(x2,y1,zF), pt(x2,y1,zB), pt(x2,y2,zF), pt(x2,y2,zB), norm(1,0,0),
            vec2(zF*uvScale, y1*uvScale), vec2(zB*uvScale, y1*uvScale), vec2(zF*uvScale, y2*uvScale), vec2(zB*uvScale, y2*uvScale));
      // 3. Sütunun Sol Yan Yüzü (Kalınlığı veren 3D hacim)
      pushQ(pt(x1,y1,zB), pt(x1,y1,zF), pt(x1,y2,zB), pt(x1,y2,zF), norm(-1,0,0),
            vec2(zB*uvScale, y1*uvScale), vec2(zF*uvScale, y1*uvScale), vec2(zB*uvScale, y2*uvScale), vec2(zF*uvScale, y2*uvScale));
    }

    // Yanlardaki Kalın Taş Sütunların Çizimi
    addBlock(centerX - 1.9, centerX - 1.5, 0.0, 6.0);
    addBlock(centerX + 1.5, centerX + 1.9, 0.0, 6.0);

    // Kemerin 3D Kalınlığıyla Beraber Çizimi
    const segments = 20; const rIn = 1.5, rOut = 1.9;
    for(let i=0; i<segments; i++){
        let a1 = Math.PI - (i * Math.PI)/segments; let a2 = Math.PI - ((i+1) * Math.PI)/segments;
        
        let cx1 = centerX + rOut*Math.cos(a1), cy1 = 6.0 + rOut*Math.sin(a1); 
        let cx2 = centerX + rIn*Math.cos(a1),  cy2 = 6.0 + rIn*Math.sin(a1);   
        let cx3 = centerX + rOut*Math.cos(a2), cy3 = 6.0 + rOut*Math.sin(a2); 
        let cx4 = centerX + rIn*Math.cos(a2),  cy4 = 6.0 + rIn*Math.sin(a2);   

        // Kemerin Ön Yüzü
        pushQ(pt(cx2,cy2,zF), pt(cx4,cy4,zF), pt(cx1,cy1,zF), pt(cx3,cy3,zF), nFront,
              vec2(cx2*uvScale, cy2*uvScale), vec2(cx4*uvScale, cy4*uvScale), vec2(cx1*uvScale, cy1*uvScale), vec2(cx3*uvScale, cy3*uvScale));
              
        // Kemerin İç Yüzü (Kalınlık - Kapı boşluğuna bakan kısım)
        let nIn = norm(-Math.cos((a1+a2)/2), -Math.sin((a1+a2)/2), 0);
        pushQ(pt(cx4,cy4,zF), pt(cx4,cy4,zB), pt(cx2,cy2,zF), pt(cx2,cy2,zB), nIn,
              vec2(a2*2.0, zF*uvScale), vec2(a2*2.0, zB*uvScale), vec2(a1*2.0, zF*uvScale), vec2(a1*2.0, zB*uvScale));

        // Kemerin Dış Yüzü (Kalınlık - Duvara gömülen üst kısım)
        let nOut = norm(Math.cos((a1+a2)/2), Math.sin((a1+a2)/2), 0);
        pushQ(pt(cx1,cy1,zB), pt(cx1,cy1,zF), pt(cx3,cy3,zB), pt(cx3,cy3,zF), nOut,
              vec2(a1*2.0, zB*uvScale), vec2(a1*2.0, zF*uvScale), vec2(a2*2.0, zB*uvScale), vec2(a2*2.0, zF*uvScale));
    }
  }
  
  // Devasa Çerçeveler Tüm Pencerelere Ekleniyor
  addFrame(true, -floorSize, -6.0); addFrame(true, -floorSize, 6.0);
  addFrame(false, -floorSize, -6.0); addFrame(false, -floorSize, 6.0);
  addFrame(false, floorSize, -6.0); addFrame(false, floorSize, 6.0);
  
  // YENİ: KAPIYA DA DEVASE ÇERÇEVE EKLENDİ!
  addFrame(true, floorSize, 0.0); 

  numFrameVertices = frameVertices.length;
  frameBuffer = makeBuffer(frameVertices);
  frameNormalBuffer = makeBuffer(frameNormals);
  frameTexBuffer = makeBuffer(frameTexCoords);

  // --- DEMİR PARMAKLIKLAR ---
  let ironVertices = [];
  function addIronBars(isZWall, fixedPos, centerX) {
    const zPos = fixedPos + (fixedPos < 0 ? 0.03 : -0.03); const x1 = centerX - 1.5, x2 = centerX + 1.5;
    function pushLine(ax, ay, bx, by) { ironVertices.push(isZWall ? vec4(ax, ay, zPos, 1.0) : vec4(zPos, ay, ax, 1.0), isZWall ? vec4(bx, by, zPos, 1.0) : vec4(zPos, by, bx, 1.0)); }
    pushLine(centerX, 0.0, centerX, 7.5); pushLine(x1, 6.0, x2, 6.0); pushLine(x1, 2.0, x2, 2.0); pushLine(x1, 4.0, x2, 4.0);
  }
  addIronBars(true, -floorSize, -6.0); addIronBars(true, -floorSize, 6.0); addIronBars(false, -floorSize, -6.0); addIronBars(false, -floorSize, 6.0); addIronBars(false, floorSize, -6.0); addIronBars(false, floorSize, 6.0);
  numIronVertices = ironVertices.length;
  ironBuffer = makeBuffer(ironVertices);
  ironNormalBuffer = makeBuffer(ironVertices.map(() => vec3(0.0, 1.0, 0.0)));
  ironTexBuffer = makeBuffer(generateWorldUVs(ironVertices, 1.0));

  // --- KAPI (Kusursuz Planar UV & Normaller) ---
  let doorVertices = [];
  let doorTexCoords = [];
  let doorNormals = [];
  function buildDoor(fixedZ, centerX) {
    const r = 1.5, archBaseY = 6.0, segments = 20; const zPos = fixedZ - 0.02; const x1 = centerX - 1.5, x2 = centerX + 1.5;
    let scale = 0.5; 
    let n = vec3(0.0, 0.0, -1.0); // Kapı her zaman içeriye bakar

    let p1 = vec4(x1, 0.0, zPos, 1.0), p2 = vec4(x2, 0.0, zPos, 1.0), p3 = vec4(x1, archBaseY, zPos, 1.0), p4 = vec4(x2, archBaseY, zPos, 1.0);
    let t1 = vec2(x1*scale, 0.0), t2 = vec2(x2*scale, 0.0), t3 = vec2(x1*scale, archBaseY*scale), t4 = vec2(x2*scale, archBaseY*scale);

    doorVertices.push(p1, p2, p3, p3, p2, p4);
    doorTexCoords.push(t1, t2, t3, t3, t2, t4);
    doorNormals.push(n, n, n, n, n, n);
    
    for (let i = 0; i < segments; i++) {
        let cx1 = centerX; let cy1 = archBaseY;
        let cx2 = centerX + r * Math.cos(Math.PI - (i * Math.PI) / segments); let cy2 = archBaseY + r * Math.sin(Math.PI - (i * Math.PI) / segments);
        let cx3 = centerX + r * Math.cos(Math.PI - ((i + 1) * Math.PI) / segments); let cy3 = archBaseY + r * Math.sin(Math.PI - ((i + 1) * Math.PI) / segments);
        
        let pC = vec4(cx1, cy1, zPos, 1.0), pL = vec4(cx2, cy2, zPos, 1.0), pR = vec4(cx3, cy3, zPos, 1.0);
        let tC = vec2(cx1*scale, cy1*scale), tL = vec2(cx2*scale, cy2*scale), tR = vec2(cx3*scale, cy3*scale);

        doorVertices.push(pC, pR, pL); // CCW Kemer Yönü Düzeltmesi!
        doorTexCoords.push(tC, tR, tL);
        doorNormals.push(n, n, n);
    }
  }
  buildDoor(floorSize, 0.0);
  numDoorVertices = doorVertices.length;
  doorBuffer = makeBuffer(doorVertices);
  doorNormalBuffer = makeBuffer(doorNormals); 
  doorTexBuffer = makeBuffer(doorTexCoords);

  // --- MEŞALELER ---
  let torchVertices = [];
  function addTorch(bx, by, bz) {
    const w = 0.04, l = 1.0, a = radians(60.0);
    torchVertices.push(vec4(bx - w, by, bz, 1.0), vec4(bx + w, by, bz, 1.0), vec4(bx - w, by + l * Math.sin(a), bz - l * Math.cos(a), 1.0));
    torchVertices.push(vec4(bx - w, by + l * Math.sin(a), bz - l * Math.cos(a), 1.0), vec4(bx + w, by, bz, 1.0), vec4(bx + w, by + l * Math.sin(a), bz - l * Math.cos(a), 1.0));
  }
  addTorch(-2.5, 4.0, floorSize - 0.05); addTorch(2.5, 4.0, floorSize - 0.05);
  numTorchVertices = torchVertices.length;
  torchBuffer = makeBuffer(torchVertices);
  torchNormalBuffer = makeBuffer(makeNormalData(torchVertices));
  torchTexBuffer = makeBuffer(generateWorldUVs(torchVertices, 1.0)); 

  // --- MASALAR (ESNEME YAPAN ESKİ KOD TAMAMEN DEĞİŞTİ!) ---
  let tableVertices = [];
  let tableTexCoords = [];
  function addTableBox(cx, cy, cz, w, h, d) {
    let hw = w/2, hh = h/2, hd = d/2;
    let p0 = vec4(cx-hw, cy-hh, cz+hd, 1.0), p1 = vec4(cx+hw, cy-hh, cz+hd, 1.0), p2 = vec4(cx+hw, cy+hh, cz+hd, 1.0), p3 = vec4(cx-hw, cy+hh, cz+hd, 1.0);
    let p4 = vec4(cx-hw, cy-hh, cz-hd, 1.0), p5 = vec4(cx+hw, cy-hh, cz-hd, 1.0), p6 = vec4(cx+hw, cy+hh, cz-hd, 1.0), p7 = vec4(cx-hw, cy+hh, cz-hd, 1.0);
    
    let scale = 0.8; // Masadaki taş dokusunun keskinliği
    function pushFace(a, b, c, d, sx, sy) {
      tableVertices.push(a, b, c, a, c, d);
      tableTexCoords.push(vec2(0,0), vec2(sx,0), vec2(sx,sy), vec2(0,0), vec2(sx,sy), vec2(0,sy)); // Yüzeylere mükemmel UV oturtması
    }
    pushFace(p1, p0, p3, p2, w*scale, h*scale); // Ön
    pushFace(p4, p5, p6, p7, w*scale, h*scale); // Arka
    pushFace(p3, p0, p4, p7, d*scale, h*scale); // Sol
    pushFace(p5, p1, p2, p6, d*scale, h*scale); // Sağ
    pushFace(p3, p2, p6, p7, w*scale, d*scale); // Üst
    pushFace(p0, p1, p5, p4, w*scale, d*scale); // Alt
  }
  function addTable(cx, cz) {
    let lw = 0.4;
    addTableBox(cx, 2.75, cz, 3.5, 0.5, 3.5);
    addTableBox(cx + 1.55, 1.25, cz + 1.55, lw, 2.5, lw);
    addTableBox(cx - 1.55, 1.25, cz + 1.55, lw, 2.5, lw);
    addTableBox(cx + 1.55, 1.25, cz - 1.55, lw, 2.5, lw);
    addTableBox(cx - 1.55, 1.25, cz - 1.55, lw, 2.5, lw);
  }
  addTable(0.0, -10.25); addTable(-10.25, 0.0); addTable(10.25, 0.0);
  numTableVertices = tableVertices.length;
  tableBuffer = makeBuffer(tableVertices);
  tableNormalBuffer = makeBuffer(makeNormalData(tableVertices));
  tableTexBuffer = makeBuffer(tableTexCoords);

  // ==========================================
  // --- YENİ: 3 BÜYÜLÜ OBJE VE DOKU BUFFER'LARI ---
  // ==========================================

  let palantirGen = generateSphere(0.8, 40, 40); 
  numPalantirVertices = palantirGen.vertices.length;
  palantirBuffer = makeBuffer(palantirGen.vertices);
  palantirNormalBuffer = makeBuffer(palantirGen.normals); // Pürüzsüz Shading eklendi
  palantirTexBuffer = makeBuffer(palantirGen.texCoords); 
  palantirTexture = loadTexture("/eye.jpg"); 

  let ringGen = generateTorus(0.5, 0.15, 40, 40); 
  numRingVertices = ringGen.vertices.length;
  ringBuffer = makeBuffer(ringGen.vertices);
  ringNormalBuffer = makeBuffer(ringGen.normals); 
  
  // YENİ: Oymaların/Rünlerin yüzüğün etrafını kesintisiz 3 kez sarması için UV'leri sıklaştırıyoruz
  let ringUVs = [];
  for (let i = 0; i < ringGen.texCoords.length; i++) {
    ringUVs.push(vec2(ringGen.texCoords[i][0] * 3.0, ringGen.texCoords[i][1] * 1.0));
  }
  ringTexBuffer = makeBuffer(ringUVs); 
  
  // DÜZELTME: Eskiden burada yanlışlıkla "/door.jpg" kalmıştı. Şimdi projedeki ring.jpg'yi alıyoruz!
  ringTexture = loadTexture("/ring.jpg");

  let bookGen = generateBook(1.2, 0.3, 1.6);
  numBookVertices = bookGen.vertices.length;
  bookBuffer = makeBuffer(bookGen.vertices);
  bookNormalBuffer = makeBuffer(bookGen.normals); // Pürüzsüz Shading eklendi
  bookTexBuffer = makeBuffer(bookGen.texCoords); 
  bookTexture = loadTexture("/spellbook.jpg");

  // Color Picking için görünmez arka tamponu (Framebuffer) başlat
  initPickingFramebuffer();

// Fare tıklama olayı (Objeleri seçmek için)
  canvas.addEventListener("mousedown", (e) => {
    e.preventDefault(); // Diğer event'lerle çakışmayı önler
    pickObject(); 
  });

  render();
}; // window.onload SONU

// ==========================================
// PENCERE BOYUTLANDIRMA
// ==========================================
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  gl.viewport(0, 0, canvas.width, canvas.height);
  
  // YENİ: Ekran boyutu değiştiğinde Gizli Seçim Ekranını (Framebuffer) da boyutlandır!
  // (DevTools açtığında veya pencereyi küçülttüğünde seçimin kaymasını engeller)
  if (typeof pickingTexture !== 'undefined' && pickingTexture) {
    gl.bindTexture(gl.TEXTURE_2D, pickingTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, canvas.width, canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, pickingRenderbuffer);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, canvas.width, canvas.height);
  }
}
// ==========================================
// COLOR PICKING (OBJE SEÇİMİ) VE FRAMEBUFFER KURULUMU
// ==========================================
let pickingFramebuffer, pickingRenderbuffer, pickingTexture;

function initPickingFramebuffer() {
  pickingFramebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, pickingFramebuffer);

  pickingTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, pickingTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, canvas.width, canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

  pickingRenderbuffer = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, pickingRenderbuffer);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, canvas.width, canvas.height);

  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, pickingTexture, 0);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, pickingRenderbuffer);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

// ==========================================
// COLOR PICKING (AKILLI HITBOX İLE OBJE SEÇİMİ)
// ==========================================
function pickObject() {
  const camData = updateCamera(); 

  // 1. Sahneyi gizlice renk modunda Framebuffer'a çiz
  gl.bindFramebuffer(gl.FRAMEBUFFER, pickingFramebuffer);
  gl.uniform1i(uRenderModeLoc, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  
  // YENİ: Gizli çizime başlamadan önce Kameranın açılarını GPU'ya zorla gönderiyoruz (Kaymayı önler)
  const aspect = canvas.width / canvas.height;
  const projectionMatrix = perspective(camData.fov, aspect, 0.1, 100.0);
  gl.uniformMatrix4fv(projectionMatrixLoc, false, flatten(projectionMatrix));
  gl.uniformMatrix4fv(viewMatrixLoc, false, flatten(camData.viewMatrix));
// Gizli çizim için ışığı kapatıyoruz ki renkler bozulmasın
  isPicking = true;
  gl.uniform1i(useLightingLoc, 0); 
  renderSceneGeometry(camData);
  gl.uniform1i(useLightingLoc, 1); // Normal çizime dönerken tekrar aç
  isPicking = false;

  // 2. AKILLI HEDEFLEME
  const size = 10; 
  const startX = Math.floor(canvas.width / 2) - (size / 2);
  const startY = Math.floor(canvas.height / 2) - (size / 2);
  
  let pixels = new Uint8Array(size * size * 4);
  gl.readPixels(startX, startY, size, size, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

  // 3. Normal çizime geri dön
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.uniform1i(uRenderModeLoc, 0);

  // 4. Hangi obje seçildi karar ver (Renk Solgunluğu Koruması Eklendi!)
  let picked = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    // YENİ: === 255 yerine > 200 kullanıyoruz. Tarayıcı renk profilleri rengi soluklaştırsa bile garantili çalışır!
    if (pixels[i] > 200 && pixels[i+1] < 50 && pixels[i+2] < 50) {
      picked = 1; break; // Kırmızı (Palantir)
    } else if (pixels[i] < 50 && pixels[i+1] > 200 && pixels[i+2] < 50) {
      picked = 2; break; // Yeşil (Yüzük)
    } else if (pixels[i] < 50 && pixels[i+1] < 50 && pixels[i+2] > 200) {
      picked = 3; break; // Mavi (Kitap)
    }
  }

  // Seçimi onayla ve konsola yaz
  selectedObject = picked;
  if (picked === 1) console.log("Palantir Seçildi");
  else if (picked === 2) console.log("Yüzük Seçildi");
  else if (picked === 3) console.log("Kitap Seçildi");
}

// ==========================================
// PROFESYONEL ÇOKLU-DOKU (MULTI-TEXTURE) ÇİZİM FONKSİYONU
// ==========================================
function drawShapeWithTexture(buffer, normalBuffer, texBuffer, texture, bumpMap, vertexCount, color, modelMatrix, pickingColor, options = {}) {
  gl.uniformMatrix4fv(modelMatrixLoc, false, flatten(modelMatrix));
  gl.uniform4fv(colorLoc, flatten(color));
  gl.uniform4fv(uPickingColorLoc, flatten(pickingColor));
  gl.uniform1i(uIsMagicLoc, options.isMagic ? 1 : 0); // YENİ: KORUMA KALKANI AÇIK/KAPALI
  gl.uniform1i(uIsRingLoc, options.isRing ? 1 : 0); // YENİ: Rün kalkanı
  gl.uniform1i(uIsPalantirLoc, options.isPalantir ? 1 : 0);

  if (texture && texBuffer) {
    gl.uniform1i(uHasTextureLoc, 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(uTextureLoc, 0);
    gl.enableVertexAttribArray(vTexCoord);
    gl.bindBuffer(gl.ARRAY_BUFFER, texBuffer);
    gl.vertexAttribPointer(vTexCoord, 2, gl.FLOAT, false, 0, 0);
  } else {
    gl.uniform1i(uHasTextureLoc, 0);
    if (!bumpMap) gl.disableVertexAttribArray(vTexCoord);
  }

  if (bumpMap && texBuffer) {
    gl.uniform1i(uHasBumpMapLoc, 1);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, bumpMap);
    gl.uniform1i(uBumpMapLoc, 1);
    if (!texture) { 
        gl.enableVertexAttribArray(vTexCoord);
        gl.bindBuffer(gl.ARRAY_BUFFER, texBuffer);
        gl.vertexAttribPointer(vTexCoord, 2, gl.FLOAT, false, 0, 0);
    }
  } else {
    gl.uniform1i(uHasBumpMapLoc, 0);
  }

  // Gizli seçim ekranındaysak ışıkları ZORLA kapalı tut (Kusursuz renk algılama için)
  if (isPicking) {
      gl.uniform1i(useLightingLoc, 0);
  } else {
      gl.uniform1i(useLightingLoc, options.useLighting === false ? 0 : 1);
  }
  gl.uniform1f(shininessLoc, options.shininess || 32.0);
  gl.uniform1f(specularStrengthLoc, options.specularStrength || 0.35);

  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.vertexAttribPointer(vPosition, 4, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
  gl.vertexAttribPointer(vNormal, 3, gl.FLOAT, false, 0, 0);
  gl.drawArrays(options.mode || gl.TRIANGLES, options.first || 0, vertexCount);
}

// ==========================================
// GEOMETRİ SAHNESİ (GÖRÜNÜR VEYA GİZLİ ÇİZİM İÇİN)
// ==========================================
function renderSceneGeometry(camData) {
  const identityMatrix = mat4();
  const isFogActive = (activeSpellMode === 3) ? 2 : 0; 
  gl.uniform1i(uSpellModeLoc, isFogActive);
  
  // 1. ÇEVRE VE ODANIN ÇİZİMİ
  // Zemin ve Tavan (Kraterli taş)
  drawShapeWithTexture(floorBuffer, floorNormalBuffer, floorTexBuffer, floorDiffuse, floorBump, 6, vec4(0.5, 0.5, 0.5, 1.0), identityMatrix, vec4(0), { first: 0, shininess: 12.0, specularStrength: 0.15 });
  drawShapeWithTexture(floorBuffer, floorNormalBuffer, floorTexBuffer, floorDiffuse, floorBump, 6, vec4(0.3, 0.3, 0.3, 1.0), identityMatrix, vec4(0), { first: 6, shininess: 4.0, specularStrength: 0.05 });
  
  drawShapeWithTexture(wallBuffer, wallNormalBuffer, wallTexBuffer, wallDiffuse, wallBump, numWallVertices, vec4(0.4, 0.4, 0.45, 1.0), identityMatrix, vec4(0), { shininess: 8.0, specularStrength: 0.2 });
  // Kapı (Farklı, düzensiz dev kayalar ve duvarlardan ayrışan daha soğuk/metalik bir gri tonu)
  drawShapeWithTexture(doorBuffer, doorNormalBuffer, doorTexBuffer, doorDiffuse, doorBump, numDoorVertices, vec4(0.35, 0.38, 0.42, 1.0), identityMatrix, vec4(0), { shininess: 8.0, specularStrength: 0.5 });
  drawShapeWithTexture(tableBuffer, tableNormalBuffer, tableTexBuffer, stoneDiffuse, stoneBump, numTableVertices, vec4(0.45, 0.45, 0.48, 1.0), identityMatrix, vec4(0), { shininess: 15.0, specularStrength: 0.4 });
  drawShapeWithTexture(torchBuffer, torchNormalBuffer, torchTexBuffer, stoneDiffuse, stoneBump, numTorchVertices, vec4(0.35, 0.35, 0.35, 1.0), identityMatrix, vec4(0), { shininess: 10.0, specularStrength: 0.1 });

  // YENİ: CAM ÇERÇEVELERİ ÇİZİLİYOR (Duvar tuğlası değil, kalın TAŞ dokusuyla)
  // Çerçeveler: Hem pencerelerde hem kapıda! Duvardan fırlayan iri, pürüzlü taş kayalar (doorBump)
  drawShapeWithTexture(frameBuffer, frameNormalBuffer, frameTexBuffer, doorDiffuse, doorBump, numFrameVertices, vec4(0.40, 0.42, 0.45, 1.0), identityMatrix, vec4(0), { shininess: 8.0, specularStrength: 0.4 });
  animationTime += 0.03;
  // 2. BÜYÜLÜ OBJELER VE FİZİK MOTORU
  
  // ==========================================
  // YENİ: WINGARDIUM LEVIOSA (Çarpışma ve Yerçekimi Matematiği)
  // ==========================================
  function getSurfaceY(x, z) {
      // Masaların çarpışma sınırları (Genişlik/Derinlik toleransı: 2.0 birim)
      if (Math.abs(x - 0.0) < 2.0 && Math.abs(z - -10.25) < 2.0) return 3.0;
      if (Math.abs(x - -10.25) < 2.0 && Math.abs(z - 0.0) < 2.0) return 3.0;
      if (Math.abs(x - 10.25) < 2.0 && Math.abs(z - 0.0) < 2.0) return 3.0;
      return 0.0; // Eğer masaların üstünde değilse Zemin (0.0) seviyesindedir
  }

  // Havaya Kaldırma (Levitasyon) Fiziği
  if (activeSpellMode === 2 && selectedObject !== 0) {
      // 1. Hedef Belirle: Asanın baktığı yönün 6 birim ilerisi (havada)
      let tX = camData.eye[0] + camData.direction[0] * 6.0;
      let tY = camData.eye[1] + camData.direction[1] * 6.0;
      let tZ = camData.eye[2] + camData.direction[2] * 6.0;
      
      // 2. Duvarlardan dışarı çıkmasını engelle (Zindanın sınırları)
      tX = clamp(tX, -11.0, 11.0);
      tZ = clamp(tZ, -11.0, 11.0);
      
      // 3. Masanın VEYA Zeminin içine girmesini engelle! (Daima yüzeyin üstünde kalsın)
      let surfaceY = getSurfaceY(tX, tZ);
      tY = Math.max(tY, surfaceY + 1.5); // Obje yüzeyden en az 1.5 birim yukarıda uçsun
      
      // 4. Objeyi yumuşak bir şekilde asanın ucuna (hedefe) doğru süzdür (Lerp)
      objPositions[selectedObject].x += (tX - objPositions[selectedObject].x) * 0.08;
      objPositions[selectedObject].y += (tY - objPositions[selectedObject].y) * 0.08;
      objPositions[selectedObject].z += (tZ - objPositions[selectedObject].z) * 0.08;
  } 
  
  // Büyü bırakıldıysa: YERÇEKİMİ (Obje usulca yere veya masaya düşer)
  for (let i = 1; i <= 3; i++) {
      if (activeSpellMode !== 2 || selectedObject !== i) {
          let ground = getSurfaceY(objPositions[i].x, objPositions[i].z);
          if (objPositions[i].y > ground) {
              objPositions[i].y -= 0.10; // Düşüş hızı
              if (objPositions[i].y < ground) objPositions[i].y = ground; // Yere çarpınca dur
          }
      }
  }

  // --- 1. PALANTİR ÇİZİMİ ---
  let pScale = objScales[1];
  let pY = objPositions[1].y + (0.8 * pScale); // Tabanı yüzeye değecek şekilde yarıçapı ekle
  let pX = objPositions[1].x, pZ = objPositions[1].z;
  
  let palantirModel = translate(pX, pY, pZ);
  let dx = camData.eye[0] - pX, dz = camData.eye[2] - pZ;
  let trackAngle = Math.atan2(dx, dz) * (180.0 / Math.PI);
  
  if (selectedObject === 1 && activeSpellMode === 2) { 
       palantirModel = mult(palantirModel, rotateY(animationTime * 150.0)); // Havada hızla döner
  } else {
       palantirModel = mult(palantirModel, rotateY(trackAngle + 90.0)); // Yerdeyken oyuncuyu izler
  }
  palantirModel = mult(palantirModel, scalem(pScale, pScale, pScale)); 
  
  gl.uniform1i(uSpellModeLoc, (selectedObject === 1 && activeSpellMode === 1) ? 1 : isFogActive);
  drawShapeWithTexture(palantirBuffer, palantirNormalBuffer, palantirTexBuffer, palantirTexture, null, numPalantirVertices, vec4(1.0, 1.0, 1.0, 1.0), palantirModel, vec4(1.0, 0.0, 0.0, 1.0), { isMagic: true, isPalantir: true, shininess: 150.0, specularStrength: 1.5 });

  // --- 2. YÜZÜK ÇİZİMİ ---
  let rScale = objScales[2];
  let rY = objPositions[2].y + (0.15 * rScale); 
  let ringModel = translate(objPositions[2].x, rY, objPositions[2].z);
  
  if (selectedObject === 2 && activeSpellMode === 2) { 
       ringModel = mult(ringModel, rotateY(animationTime * 200.0)); // Havada fırıl fırıl döner
       ringModel = mult(ringModel, rotateX(animationTime * 80.0));  // Takla atar
  } else {
       ringModel = mult(ringModel, rotateY(90.0)); // Yerdeyken sabit durur
  }
  ringModel = mult(ringModel, scalem(rScale, rScale, rScale));
  
  gl.uniform1i(uSpellModeLoc, (selectedObject === 2 && activeSpellMode === 1) ? 1 : isFogActive);
  drawShape(ringBuffer, ringNormalBuffer, numRingVertices, vec4(1.0, 0.8, 0.1, 1.0), ringModel, { isMagic: true, isRing: true, shininess: 200.0, specularStrength: 2.0, pickingColor: vec4(0.0, 1.0, 0.0, 1.0) });

  // --- 3. BÜYÜ KİTABI ÇİZİMİ ---
  let bScale = objScales[3];
  let bY = objPositions[3].y + (0.15 * bScale); 
  let bookModel = translate(objPositions[3].x, bY, objPositions[3].z);
  
  if (selectedObject === 3 && activeSpellMode === 2) { 
       bookModel = mult(bookModel, rotateY(animationTime * 100.0)); // Havada döner
       bookModel = mult(bookModel, rotateX(Math.sin(animationTime) * 20.0)); // Hafif sallanır
  } else {
       bookModel = mult(bookModel, rotateY(-90.0)); 
  }
  bookModel = mult(bookModel, scalem(bScale, bScale, bScale)); 
  
  gl.uniform1i(uSpellModeLoc, (selectedObject === 3 && activeSpellMode === 1) ? 1 : isFogActive);
  drawShapeWithTexture(bookBuffer, bookNormalBuffer, bookTexBuffer, bookTexture, null, numBookVertices, vec4(1.0, 1.0, 1.0, 1.0), bookModel, vec4(0.0, 0.0, 1.0, 1.0), { isMagic: true, shininess: 20.0, specularStrength: 0.15 });
  
  // ==========================================
  // --- YENİ: UÇAN AVADA KEDAVRA IŞINI ---
  // ==========================================
  if (akActive) {
      akDistance += 0.95; // Büyünün uçuş hızı (Saniyede ne kadar ileri gideceği)
      
      // Işının o anki XYZ konumu (Başlangıç noktası + Yön * Mesafe)
      let currentPos = add(akPos, scale(akDistance, akDir));
      let akModel = translate(currentPos[0], currentPos[1], currentPos[2]);
      
      // Işını fırlatıldığı yöne doğru döndür ki yan gitmesin, ileri baksın!
      let yaw = Math.atan2(akDir[0], akDir[2]) * (180.0 / Math.PI);
      let pitch = Math.asin(akDir[1]) * (180.0 / Math.PI);
      akModel = mult(akModel, rotateY(yaw));
      akModel = mult(akModel, rotateX(-pitch));
      
      // Küreyi ince-uzun bir lazer ışını (çizgi) haline getirecek şekilde esnet!
      akModel = mult(akModel, scalem(0.04, 0.04, 1.8)); 
      
      // Büyüyü parlak, gölgesiz ve etrafına aura yayan bir zümrüt yeşiliyle çiz
      gl.uniform1i(uSpellModeLoc, 1); 
      drawShape(palantirBuffer, palantirNormalBuffer, numPalantirVertices, vec4(0.1, 1.0, 0.2, 1.0), akModel, { isMagic: true, useLighting: false });
      
      // Büyü 40 birim uzağa (karanlığa) ulaştığında yok olsun
      if (akDistance > 40.0) {
          akActive = false; 
      }
  }
  
  // 3. SAYDAM OBJELER
  gl.uniform1i(uSpellModeLoc, isFogActive); 
  
  drawShapeWithTexture(windowBuffer, windowNormalBuffer, windowTexBuffer, null, glassBump, numWindowVertices, vec4(0.05, 0.08, 0.1, 0.65), identityMatrix, vec4(0), { shininess: 200.0, specularStrength: 1.5 });
  drawShapeWithTexture(ironBuffer, ironNormalBuffer, ironTexBuffer, stoneDiffuse, stoneBump, numIronVertices, vec4(0.1, 0.1, 0.12, 1.0), identityMatrix, vec4(0), { mode: gl.LINES, useLighting: false });
}
// ==========================================
// ANA RENDER DÖNGÜSÜ
// ==========================================
function render() {
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.uniform1f(uTimeLoc, performance.now() / 1000.0);

  const camData = updateCamera();
  const aspect = canvas.width / canvas.height;
  const projectionMatrix = perspective(camData.fov, aspect, 0.1, 100.0);

  gl.uniformMatrix4fv(projectionMatrixLoc, false, flatten(projectionMatrix));
  gl.uniformMatrix4fv(viewMatrixLoc, false, flatten(camData.viewMatrix));

  const lightPosition = getWandTipPosition(camData);
  gl.uniform3fv(lightPositionLoc, flatten(lightPosition));
  gl.uniform3fv(cameraPositionLoc, flatten(camData.eye));
  gl.uniform3fv(lightDirectionLoc, flatten(normalize(camData.direction)));
  gl.uniform1f(innerCutoffLoc, Math.cos(radians(9.0)));
  gl.uniform1f(outerCutoffLoc, Math.cos(radians(26.0)));

  // AVADA KEDAVRA PATLAMA VE SÖNÜMLEME MANTIĞI
  if (avadaKedavraFlash > 0.0) {
      avadaKedavraFlash -= 0.015; // Işık her karede usulca söner
      if (avadaKedavraFlash < 0.0) avadaKedavraFlash = 0.0;

      // Ölümcül zümrüt yeşili
      gl.uniform3fv(lightColorLoc, flatten(vec3(0.1, 1.0, 0.2))); 
      
      let flashIntensity = avadaKedavraFlash * 35.0; // Devasa patlama gücü
      gl.uniform1f(lightIntensityLoc, Math.max(currentLumosIntensity * 5.2, flashIntensity));
  } else {
      // Normal Lumos ışığına geri dön
      gl.uniform3fv(lightColorLoc, flatten(vec3(1.0, 0.93, 0.72)));
      gl.uniform1f(lightIntensityLoc, currentLumosIntensity * 5.2);
  }

  gl.enableVertexAttribArray(vPosition);
  gl.enableVertexAttribArray(vNormal);

  // Sahneyi normal modda ekrana çiz
  gl.uniform1i(uRenderModeLoc, 0);
  renderSceneGeometry(camData);

  updateLumosState();
  requestAnimationFrame(render);
}