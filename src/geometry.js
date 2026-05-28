// ==========================================
// --- 3D OBJE GEOMETRİ ÜRETİCİ MODÜLÜ (PÜRÜZSÜZ YANSIMALAR) ---
// ==========================================

export function generateSphere(radius, lats, lons) {
  let vertices = []; let texCoords = []; let normals = [];
  for (let i = 0; i < lats; i++) {
    let lat0 = Math.PI * (-0.5 + i / lats); let y0 = Math.sin(lat0); let r0 = Math.cos(lat0); let v0 = i / lats;
    let lat1 = Math.PI * (-0.5 + (i + 1) / lats); let y1 = Math.sin(lat1); let r1 = Math.cos(lat1); let v1 = (i + 1) / lats;

    for (let j = 0; j < lons; j++) {
      let lng0 = 2 * Math.PI * (j / lons); let x0 = Math.cos(lng0); let z0 = Math.sin(lng0); let u0 = j / lons;
      let lng1 = 2 * Math.PI * ((j + 1) / lons); let x1 = Math.cos(lng1); let z1 = Math.sin(lng1); let u1 = (j + 1) / lons;

      let p1 = vec4(x0 * r0 * radius, y0 * radius, z0 * r0 * radius, 1.0);
      let p2 = vec4(x1 * r0 * radius, y0 * radius, z1 * r0 * radius, 1.0);
      let p3 = vec4(x1 * r1 * radius, y1 * radius, z1 * r1 * radius, 1.0);
      let p4 = vec4(x0 * r1 * radius, y1 * radius, z0 * r1 * radius, 1.0);

      // MÜKEMMEL SHADING: Her noktanın normalini merkezden dışarı hesaplıyoruz (Pürüzsüz Yansıma)
      let n1 = vec3(x0 * r0, y0, z0 * r0);
      let n2 = vec3(x1 * r0, y0, z1 * r0);
      let n3 = vec3(x1 * r1, y1, z1 * r1);
      let n4 = vec3(x0 * r1, y1, z0 * r1);

      vertices.push(p1, p2, p3, p1, p3, p4);
      texCoords.push(vec2(u0, v0), vec2(u1, v0), vec2(u1, v1), vec2(u0, v0), vec2(u1, v1), vec2(u0, v1));
      normals.push(n1, n2, n3, n1, n3, n4);
    }
  }
  return { vertices, texCoords, normals };
}

export function generateTorus(majorRadius, minorRadius, radialSegments, tubularSegments) {
  let vertices = []; let texCoords = []; let normals = [];
  for (let i = 0; i < radialSegments; i++) {
    for (let j = 0; j < tubularSegments; j++) {
      let u0 = (i / radialSegments) * Math.PI * 2; let v0 = (j / tubularSegments) * Math.PI * 2;
      let u1 = ((i + 1) / radialSegments) * Math.PI * 2; let v1 = ((j + 1) / tubularSegments) * Math.PI * 2;
      let tex_u0 = i / radialSegments; let tex_u1 = (i + 1) / radialSegments;
      let tex_v0 = j / tubularSegments; let tex_v1 = (j + 1) / tubularSegments;

      function getPointAndNormal(u, v) {
        let cx = majorRadius * Math.cos(u); let cz = majorRadius * Math.sin(u);
        let x = (majorRadius + minorRadius * Math.cos(v)) * Math.cos(u);
        let y = minorRadius * Math.sin(v);
        let z = (majorRadius + minorRadius * Math.cos(v)) * Math.sin(u);
        
        let len = Math.sqrt((x-cx)*(x-cx) + y*y + (z-cz)*(z-cz));
        let n = vec3((x-cx)/len, y/len, (z-cz)/len);
        return { p: vec4(x, y, z, 1.0), n: n };
      }

      let pn1 = getPointAndNormal(u0, v0); let pn2 = getPointAndNormal(u1, v0);
      let pn3 = getPointAndNormal(u1, v1); let pn4 = getPointAndNormal(u0, v1);

      vertices.push(pn1.p, pn2.p, pn3.p, pn1.p, pn3.p, pn4.p);
      texCoords.push(vec2(tex_u0, tex_v0), vec2(tex_u1, tex_v0), vec2(tex_u1, tex_v1), vec2(tex_u0, tex_v0), vec2(tex_u1, tex_v1), vec2(tex_u0, tex_v1));
      normals.push(pn1.n, pn2.n, pn3.n, pn1.n, pn3.n, pn4.n);
    }
  }
  return { vertices, texCoords, normals };
}

export function generateBook(width, height, depth) {
  let vertices = []; let texCoords = []; let normals = [];
  let hw = width / 2, hh = height / 2, hd = depth / 2;
  
  let p0 = vec4(-hw, -hh, hd, 1.0), p1 = vec4(hw, -hh, hd, 1.0);
  let p2 = vec4(hw, hh, hd, 1.0), p3 = vec4(-hw, hh, hd, 1.0);
  let p4 = vec4(-hw, -hh, -hd, 1.0), p5 = vec4(hw, -hh, -hd, 1.0);
  let p6 = vec4(hw, hh, -hd, 1.0), p7 = vec4(-hw, hh, -hd, 1.0);

  function pushFace(pA, pB, pC, pD, tA, tB, tC, tD, nx, ny, nz) {
    vertices.push(pA, pB, pC, pA, pC, pD);
    texCoords.push(tA, tB, tC, tA, tC, tD);
    let n = vec3(nx, ny, nz);
    normals.push(n, n, n, n, n, n);
  }

  // ÜST YÜZEY (Büyü Kitabının Kapağı - Resmin Tamamı buraya kaplanır)
  pushFace(p3, p2, p6, p7, vec2(0.0, 1.0), vec2(1.0, 1.0), vec2(1.0, 0.0), vec2(0.0, 0.0), 0.0, 1.0, 0.0);
  // ALT YÜZEY (Arka kapak, resmin kenarından koyu bir doku)
  pushFace(p0, p1, p5, p4, vec2(0.1, 0.1), vec2(0.2, 0.1), vec2(0.2, 0.2), vec2(0.1, 0.2), 0.0, -1.0, 0.0);
  
  // SAYFALAR (Ön, Arka ve Sağ) - Resmin içinden sarımtırak açık renk
  let tPage = vec2(0.8, 0.5);
  pushFace(p1, p0, p3, p2, tPage, tPage, tPage, tPage, 0.0, 0.0, 1.0); // Ön sayfalar
  pushFace(p4, p5, p6, p7, tPage, tPage, tPage, tPage, 0.0, 0.0, -1.0); // Arka sayfalar (DÜZELTİLDİ: Eskiden sırt buradaydı)
  pushFace(p5, p1, p2, p6, tPage, tPage, tPage, tPage, 1.0, 0.0, 0.0); // Sağ sayfalar

  // KİTAP SIRTI (Sol Yüzey) - Kırmızı deri kısmı doğru yerine, yani sola alındı!
  pushFace(p0, p4, p7, p3, vec2(0.0, 0.0), vec2(0.1, 0.0), vec2(0.1, 1.0), vec2(0.0, 1.0), -1.0, 0.0, 0.0);

  return { vertices, texCoords, normals };
}