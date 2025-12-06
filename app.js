
// Simple BC3 web parser and viewer (mejorado)
const fileInput = document.getElementById('fileInput');
const status = document.getElementById('status');
const treeContainer = document.getElementById('treeContainer');
const summary = document.getElementById('summary');
const treeSection = document.getElementById('tree');
const detailSection = document.getElementById('detail');
const detailContent = document.getElementById('detailContent');
const backTree = document.getElementById('backTree');
const exampleBtn = document.getElementById('exampleBtn');

let lastParsed = null;

fileInput.addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  status.textContent = `Leyendo ${f.name}...`;
  const buf = await f.arrayBuffer();
  let text;
  try {
    text = new TextDecoder('utf-8').decode(buf);
    if (!text.includes('~')) throw 'no-tilde';
  } catch(_) {
    text = new TextDecoder('iso-8859-1').decode(buf);
  }
  parseBC3(text);
});

function parseBC3(text) {
  const rawLines = text.split(/\r?\n/);
  let records = [];
  let current = null;
  for (const ln of rawLines) {
    if (ln.startsWith('~')) {
      if (current) records.push(current);
      current = ln;
    } else if (ln.startsWith('\\')) {
      if (current === null) current = ln;
      else current += '\n' + ln;
    } else {
      if (current === null && ln.trim() === '') continue;
      if (current === null) current = ln;
      else current += '\n' + ln;
    }
  }
  if (current) records.push(current);

  const T = [], C = {}, L = {}, M = [], D = {};
  for (const r of records) {
    const m = r.match(/^~([A-Z0-9_]+)\|(.*)$/s);
    if (!m) continue;
    const tag = m[1], rest = m[2];
    const fields = rest.split('|');
    if (tag === 'T') {
      T.push({code: fields[0]||'', title: fields[1]||''});
    } else if (tag === 'C') {
      C[fields[0]||''] = fields;
    } else if (tag === 'L') {
      L[fields[0]||''] = rest;
    } else if (tag === 'M') {
      M.push({raw: r, fields});
    } else if (tag === 'D') {
      D[fields[0]||''] = fields;
    }
  }

  // build chapters
  const chapters = [];
  const byCode = {};
  for (const t of T) {
    byCode[t.code] = {...t, children: [], partidas: []};
  }
  for (const code in byCode) {
    if (code.includes('.')) {
      const parent = code.substring(0, code.lastIndexOf('.'));
      if (byCode[parent]) {
        byCode[parent].children.push(byCode[code]);
      } else {
        chapters.push(byCode[code]);
      }
    } else {
      chapters.push(byCode[code]);
    }
  }

  // attach partidas
  for (const code in C) {
    const fields = C[code];
    const unidad = fields[1] || '';
    const resumen = fields[2] || '';
    const precio = fields[3] || '';
    let attached = false;
    for (const ch of chapters) {
      if (matchesCode(ch.code, code)) {
        ch.partidas.push({code, unidad, resumen, precio, mediciones: []});
        attached = true;
        break;
      }
      for (const sub of ch.children) {
        if (matchesCode(sub.code, code)) {
          sub.partidas.push({code, unidad, resumen, precio, mediciones: []});
          attached = true;
          break;
        }
      }
      if (attached) break;
    }
    if (!attached) {
      chapters.push({code, title: resumen, children: [], partidas: [{code, unidad, resumen, precio, mediciones: []}]});
    }
  }

  // parse M records and attach to partidas (try to find known code)
  const partidaCodes = Object.keys(C);
  for (const mrec of M) {
    const raw = mrec.raw;
    let found = null;
    for (const pc of partidaCodes) {
      if (raw.includes(pc)) { found = pc; break; }
    }
    if (!found) continue;
    // try extract numbers and simple formulas inside raw; collect numeric tokens
    const nums = Array.from(raw.matchAll(/[-+]?\\d+[\\.,]?\\d*/g)).map(x=>x[0].replace(',','.')).map(Number);
    const totalFromField = mrec.fields.find(f=>/^[0-9\\.,]+$/.test(f)) || null;
    const total = nums.length? nums.reduce((a,b)=>a+b,0) : (totalFromField? Number(totalFromField.replace(',','.')):0);
    // attach to partida in chapters
    outer: for (const ch of chapters) {
      for (const p of ch.partidas) {
        if (p.code === found) { p.mediciones.push({raw, cantidades: nums, total}); break outer; }
      }
      for (const sub of ch.children) {
        for (const p of sub.partidas) {
          if (p.code === found) { p.mediciones.push({raw, cantidades: nums, total}); break outer; }
        }
      }
    }
  }

  lastParsed = {chapters, counts:{T:T.length, C:Object.keys(C).length, L:Object.keys(L).length, M:M.length, D:Object.keys(D).length}};
  renderTree();
  status.textContent = `Parseado: ${lastParsed.counts.C} partidas, ${lastParsed.counts.T} títulos.`;
}

function matchesCode(chCode, partCode) {
  const c = chCode.replace('#','');
  if (!c) return false;
  if (partCode.startsWith(c)) return true;
  const num = c.split(/[A-Za-z]/)[0];
  if (num && partCode.startsWith(num)) return true;
  return false;
}

function renderTree() {
  treeSection.classList.remove('hidden');
  detailSection.classList.add('hidden');
  treeContainer.innerHTML = '';
  summary.innerHTML = `<div class="sectionCard">Resumen: ${lastParsed.counts.C} partidas • ${lastParsed.counts.T} títulos</div>`;
  for (const ch of lastParsed.chapters) {
    const el = document.createElement('div');
    el.className = 'node';
    const left = document.createElement('div');
    left.innerHTML = `<strong>${ch.title || ch.code}</strong><div><small class="codeTag">${ch.code}</small> · ${ch.children.length} sub · ${ch.partidas.length} partidas</div>`;
    const right = document.createElement('div');
    const view = document.createElement('button');
    view.textContent = 'Ver';
    view.className = 'button';
    view.onclick = () => showChapter(ch);
    right.appendChild(view);
    el.appendChild(left);
    el.appendChild(right);
    treeContainer.appendChild(el);
  }
}

function showChapter(ch) {
  treeSection.classList.add('hidden');
  detailSection.classList.remove('hidden');
  detailContent.innerHTML = `<h2>${ch.title || ch.code}</h2>`;
  if (ch.children && ch.children.length) {
    const h = document.createElement('h3'); h.textContent = 'Subcapítulos'; detailContent.appendChild(h);
    for (const s of ch.children) {
      const node = document.createElement('div'); node.className='node';
      node.innerHTML = `<div><strong>${s.title}</strong><div><small class="codeTag">${s.code}</small> · ${s.partidas.length} partidas</div></div>`;
      node.onclick = ()=> showChapter(s);
      detailContent.appendChild(node);
    }
  }
  if (ch.partidas && ch.partidas.length) {
    const h2 = document.createElement('h3'); h2.textContent = 'Partidas'; detailContent.appendChild(h2);
    for (const p of ch.partidas) {
      const node = document.createElement('div'); node.className='node';
      node.innerHTML = `<div><strong>${p.resumen || p.code}</strong><div><small class="codeTag">${p.code}</small> · ${p.unidad || ''} · Precio: ${p.precio || ''}</div></div><div><button class="button">Detalle</button></div>`;
      node.querySelector('button').onclick = (ev)=>{ ev.stopPropagation(); showPartida(p); };
      detailContent.appendChild(node);
    }
  }
}

function showPartida(p) {
  detailContent.innerHTML = `<button id="backToChapter" class="backlink">← Volver</button><h2>${p.resumen||p.code}</h2>`;
  let html = `<div class="sectionCard"><strong>Código:</strong> <span class="codeTag">${p.code}</span><br>`;
  html += `<strong>Unidad:</strong> ${p.unidad||''}<br><strong>Precio:</strong> ${p.precio||''}<br>`;
  const total = (p.mediciones||[]).reduce((s,m)=>s+(m.total||0),0);
  html += `<strong>Cantidad total:</strong> ${total}<br>`;
  const precioNum = parseFloat((p.precio||'').replace(',','.'))||0;
  html += `<strong>Importe estimado:</strong> ${ (precioNum && total)? ( (precioNum*total).toFixed(2) ) : 'N/D' }</div>`;
  if (p.mediciones && p.mediciones.length) {
    html += `<h3>Mediciones</h3>`;
    for (const m of p.mediciones) {
      html += `<div class="node"><div><strong>Detalle</strong><div><small class="codeTag">cant: ${m.cantidades.join(', ')}</small></div></div></div>`;
    }
  }
  detailContent.innerHTML += html;
  document.getElementById('backToChapter').onclick = ()=>{ renderTree(); detailSection.classList.add('hidden'); treeSection.classList.remove('hidden'); };
}

backTree.addEventListener('click', ()=>{ detailSection.classList.add('hidden'); treeSection.classList.remove('hidden'); });

exampleBtn.addEventListener('click', ()=>{
  if (!lastParsed) { status.textContent = 'Carga un .bc3 primero.'; return; }
  renderTree();
});
