// A 3MF project for Bambu Studio and Orca Slicer: one object, one part per STL, each part with its
// type and its own settings. The layout follows the files Bambu Studio writes: the meshes in
// 3D/Objects/object_1.model, an object of components in 3D/3dmodel.model, and the part types and
// settings in Metadata/model_settings.config. PrusaSlicer reads a different layout, so this file is
// not for PrusaSlicer. Needs makeZip from zip.js.

// binary STL to shared vertices and triangles
function stlMesh(buf) {
  const dv = new DataView(buf), n = dv.getUint32(80, true), at = new Map(), verts = [], tris = new Uint32Array(n * 3);
  for (let t = 0; t < n; t++) {
    for (let k = 0; k < 3; k++) {
      const o = 84 + t * 50 + 12 + k * 12;
      const v = [dv.getFloat32(o, true), dv.getFloat32(o + 4, true), dv.getFloat32(o + 8, true)], key = v.join(" ");
      let i = at.get(key);
      if (i === undefined) { i = verts.length; at.set(key, i); verts.push(v); }
      tris[t * 3 + k] = i;
    }
  }
  return { verts, tris };
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const MODEL = 'xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" ' +
  'xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" requiredextensions="p"';
const REL = "http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel";

// name: the object name. parts: [{name, stl: ArrayBuffer, type: "normal_part" | "modifier_part", settings: {key: value}}].
// Returns the bytes of the .3mf.
async function make3mf(name, parts) {
  const id = parts.length + 1;   // parts are objects 1..n, the object of components comes after them
  const meshes = parts.map((p, i) => {
    const { verts, tris } = stlMesh(p.stl), out = [`<object id="${i + 1}" type="model"><mesh><vertices>`];
    // float32 values, written with the digits a float32 has
    verts.forEach((v) => out.push(`<vertex x="${+v[0].toPrecision(9)}" y="${+v[1].toPrecision(9)}" z="${+v[2].toPrecision(9)}"/>`));
    out.push("</vertices><triangles>");
    for (let t = 0; t < tris.length; t += 3) out.push(`<triangle v1="${tris[t]}" v2="${tris[t + 1]}" v3="${tris[t + 2]}"/>`);
    out.push("</triangles></mesh></object>");
    return out.join("");
  });
  const objects = `<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" ${MODEL}><resources>${meshes.join("")}</resources><build/></model>`;
  const root = `<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" ${MODEL}>
<metadata name="Title">${esc(name)}</metadata>
<resources><object id="${id}" type="model"><components>
${parts.map((p, i) => `<component p:path="/3D/Objects/object_1.model" objectid="${i + 1}"/>`).join("\n")}
</components></object></resources>
<build><item objectid="${id}" printable="1"/></build></model>`;
  const meta = (k, v) => `<metadata key="${esc(k)}" value="${esc(v)}"/>`;
  const config = `<?xml version="1.0" encoding="UTF-8"?>\n<config><object id="${id}">${meta("name", name)}
${parts.map((p, i) => `<part id="${i + 1}" subtype="${p.type}">${meta("name", p.name)}${Object.entries(p.settings || {}).map(([k, v]) => meta(k, v)).join("")}</part>`).join("\n")}
</object></config>`;
  const rels = (target) => `<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Target="${target}" Id="rel-1" Type="${REL}"/></Relationships>`;
  const types = `<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>` +
    `<Default Extension="config" ContentType="text/xml"/></Types>`;
  const text = (s) => new TextEncoder().encode(s);
  const zip = await makeZip([
    { name: "[Content_Types].xml", data: text(types) },
    { name: "_rels/.rels", data: text(rels("/3D/3dmodel.model")) },
    { name: "3D/3dmodel.model", data: text(root) },
    { name: "3D/_rels/3dmodel.model.rels", data: text(rels("/3D/Objects/object_1.model")) },
    { name: "3D/Objects/object_1.model", data: text(objects) },
    { name: "Metadata/model_settings.config", data: text(config) },
  ]);
  return new Uint8Array(await zip.arrayBuffer());
}
