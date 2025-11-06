// main.js
import { supabase } from "./supabase.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* DOM */
const sheetTable = document.getElementById('sheetTable');
const sheetSelect = document.getElementById('sheetSelect');
const newSheetBtn = document.getElementById('newSheet');
const addRowBtn = document.getElementById('addRow');
const addColBtn = document.getElementById('addCol');
const statusSpan = document.getElementById('status');

const popup = document.getElementById('popup');
const popupChecks = document.getElementById('popup-checks');
const popupComment = document.getElementById('popup-comment');
const popupSave = document.getElementById('popup-save');
const popupClose = document.getElementById('popup-close');

let currentSheet = null;
let sheetMeta = { max_rows: 100, max_cols: 100 };
let cellCache = new Map(); // key -> value
let savingTimers = {}; // debounce timers per cell
let selectedTd = null;

/* ---------------------------
   Helpers
----------------------------*/
function cellKey(sheetId, r, c){ return `${sheetId}#${r}#${c}`; }

function setStatus(text){
  statusSpan.textContent = text || '';
}

/* ---------------------------
   Sheet CRUD & load
----------------------------*/
async function loadSheets(){
  const { data, error } = await supabase.from('sheets').select('*').order('created_at', {ascending:true});
  if(error){ console.error(error); return; }
  sheetSelect.innerHTML = '';
  data.forEach(s=>{
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.name;
    sheetSelect.appendChild(opt);
  });
  if(data.length) {
    sheetSelect.value = data[0].id;
    await selectSheet(data[0].id);
  }
}

async function createSheet(){
  const name = prompt('シート名を入力', `Sheet${Date.now()}`);
  if(!name) return;
  const { data, error } = await supabase.from('sheets').insert([{ name, max_rows:100, max_cols:100 }]).select().single();
  if(error){ console.error(error); alert('作成エラー'); return; }
  await loadSheets();
  sheetSelect.value = data.id;
  await selectSheet(data.id);
}

async function selectSheet(sheetId){
  currentSheet = sheetId;
  // load meta
  const { data, error } = await supabase.from('sheets').select('max_rows,max_cols').eq('id', sheetId).single();
  if(error){ console.error(error); return; }
  sheetMeta.max_rows = data.max_rows || 100;
  sheetMeta.max_cols = data.max_cols || 100;
  await loadCellsAndRender();
  subscribeRealtime();
}

/* ---------------------------
   Build & Render Grid
----------------------------*/
function buildGrid(rows, cols){
  sheetTable.innerHTML = '';
  // header
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  headRow.appendChild(document.createElement('th')); // corner
  for(let c=1;c<=cols;c++){
    const th = document.createElement('th');
    th.textContent = colLabel(c-1);
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  sheetTable.appendChild(thead);

  // body
  const tbody = document.createElement('tbody');
  for(let r=1;r<=rows;r++){
    const tr = document.createElement('tr');
    const rowHead = document.createElement('th');
    rowHead.textContent = String(r);
    tr.appendChild(rowHead);

    for(let c=1;c<=cols;c++){
      const td = document.createElement('td');
      td.className = 'cell';
      td.contentEditable = true;
      td.dataset.row = r;
      td.dataset.col = c;

      const key = cellKey(currentSheet, r, c);
      if(cellCache.has(key)){
        td.textContent = cellCache.get(key);
      } else {
        td.textContent = '';
      }

      td.addEventListener('focus', ()=> {
        if(selectedTd) selectedTd.classList.remove('selected');
        selectedTd = td;
        td.classList.add('selected');
      });

      // auto-save (debounce) on input
      td.addEventListener('input', (e) => {
        const val = td.innerText;
        const k = `${r}_${c}`;
        if(savingTimers[k]) clearTimeout(savingTimers[k]);
        savingTimers[k] = setTimeout(()=> {
          saveCell(r,c,val);
        }, 700);
      });

      // Enter key moves down
      td.addEventListener('keydown', (e)=> {
        if(e.key === 'Enter') {
          e.preventDefault();
          const nr = Math.min(rows, r+1);
          const target = sheetTable.querySelector(`td[data-row="${nr}"][data-col="${c}"]`);
          if(target) { target.focus(); }
        }
        if(e.key === 'Tab') {
          // allow default tab behavior but prevent losing formatting
        }
      });

      td.addEventListener('dblclick', ()=> {
        // open popup for this cell
        openPopup(r,c,td);
      });

      td.addEventListener('click', (e)=>{
        // single click selects; double click opens popup (above)
        // you can change behavior to single click if preferred
      });

      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  sheetTable.appendChild(tbody);
}

function colLabel(n){
  // 0 -> A, 26 -> AA
  let s = '';
  while(n >= 0){
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n/26) - 1;
  }
  return s;
}

/* ---------------------------
   Cells: load/save
----------------------------*/
async function loadCellsAndRender(){
  if(!currentSheet) return;
  setStatus('読み込み中...');
  const { data, error } = await supabase.from('cells').select('*').eq('sheet_id', currentSheet);
  if(error){ console.error(error); setStatus('読み込みエラー'); return; }
  cellCache.clear();
  data.forEach(c=>{
    const key = cellKey(currentSheet, c.row, c.col);
    cellCache.set(key, c.value || '');
  });
  buildGrid(sheetMeta.max_rows, sheetMeta.max_cols);
  setStatus('');
}

async function saveCell(row, col, value){
  if(!currentSheet) return;
  const record = { sheet_id: currentSheet, row: Number(row), col: Number(col), value: String(value), updated_at: new Date().toISOString() };
  const { error } = await supabase.from('cells').upsert(record);
  if(error){ console.error('saveCell error', error); setStatus('保存エラー'); return; }
  const key = cellKey(currentSheet, row, col);
  cellCache.set(key, value);
  setStatus('保存しました');
  setTimeout(()=> setStatus(''), 900);
}

/* ---------------------------
   Popup: notes (checks + comment)
   double-click cell to open popup
----------------------------*/
let popupRow = null;
let popupCol = null;

async function openPopup(r,c,td){
  popupRow = r; popupCol = c;
  // position popup near td
  const rect = td.getBoundingClientRect();
  popup.style.left = `${rect.right + 8 + window.scrollX}px`;
  popup.style.top = `${rect.top + window.scrollY}px`;
  popup.classList.remove('hidden');
  popup.setAttribute('aria-hidden','false');

  // load note
  const { data } = await supabase.from('cell_notes').select('*').eq('sheet_id', currentSheet).eq('row', r).eq('col', c).maybeSingle();
  // use sample check items; adjust as needed
  const checkItems = ['要件確認','形式確認','上長承認'];
  popupChecks.innerHTML = '';
  checkItems.forEach(item=>{
    const id = `chk_${item}`;
    const checked = data?.checked_items?.includes(item) || false;
    popupChecks.insertAdjacentHTML('beforeend', `<label><input type="checkbox" class="chk" value="${item}" ${checked ? 'checked' : ''}> ${item}</label><br>`);
  });
  popupComment.value = data?.comment || '';
}

popupSave.addEventListener('click', async ()=>{
  const checked = [...popupChecks.querySelectorAll('.chk')].filter(cb=>cb.checked).map(cb=>cb.value);
  const comment = popupComment.value || '';
  const payload = {
    sheet_id: currentSheet,
    row: popupRow,
    col: popupCol,
    checked_items: checked,
    comment,
    updated_at: new Date().toISOString()
  };
  const { error } = await supabase.from('cell_notes').upsert(payload, { onConflict: ['sheet_id','row','col'] });
  if(error){ console.error(error); alert('保存失敗'); return; }
  popup.classList.add('hidden');
  popup.setAttribute('aria-hidden','true');
});

popupClose.addEventListener('click', ()=>{ popup.classList.add('hidden'); popup.setAttribute('aria-hidden','true'); });

/* ---------------------------
   Add row / col
----------------------------*/
addRowBtn.addEventListener('click', async ()=>{
  if(!currentSheet) return;
  sheetMeta.max_rows++;
  await supabase.from('sheets').update({ max_rows: sheetMeta.max_rows }).eq('id', currentSheet);
  buildGrid(sheetMeta.max_rows, sheetMeta.max_cols);
});

addColBtn.addEventListener('click', async ()=>{
  if(!currentSheet) return;
  sheetMeta.max_cols++;
  await supabase.from('sheets').update({ max_cols: sheetMeta.max_cols }).eq('id', currentSheet);
  buildGrid(sheetMeta.max_rows, sheetMeta.max_cols);
});

/* ---------------------------
   New sheet
----------------------------*/
newSheetBtn.addEventListener('click', async ()=> {
  await createNewSheet();
});

async function createNewSheet(){
  const name = prompt('新しいシート名を入力','NewSheet');
  if(!name) return;
  const { data, error } = await supabase.from('sheets').insert({ name, max_rows: 100, max_cols: 100 }).select().single();
  if(error){ console.error(error); alert('シート作成エラー'); return; }
  await loadSheets();
  sheetSelect.value = data.id;
  await selectSheet(data.id);
}

/* ---------------------------
   Sheet selector change
----------------------------*/
sheetSelect.addEventListener('change', async (e)=> {
  const id = e.target.value;
  await selectSheet(id);
});

/* ---------------------------
   Realtime subscription
----------------------------*/
let channel = null;
function subscribeRealtime(){
  if(channel) {
    try { channel.unsubscribe(); } catch(e){/* ignore */ }
    channel = null;
  }
  channel = supabase.channel(`sheet-${currentSheet}`);
  channel.on('postgres_changes', { event: '*', schema: 'public', table: 'cells', filter: `sheet_id=eq.${currentSheet}` }, payload=>{
    const rec = payload.new;
    if(!rec) return;
    const key = cellKey(currentSheet, rec.row, rec.col);
    // if cell is being actively edited (document.activeElement === td), don't overwrite
    const td = sheetTable.querySelector(`td[data-row="${rec.row}"][data-col="${rec.col}"]`);
    if(td && document.activeElement !== td){
      td.innerText = rec.value || '';
      cellCache.set(key, rec.value || '');
    }
  }).on('postgres_changes', { event: '*', schema: 'public', table: 'cell_notes', filter: `sheet_id=eq.${currentSheet}` }, payload=>{
    // if a note changed elsewhere, we might update popup if it's open on same cell
    const rec = payload.new;
    if(!rec) return;
    if(popupRow === rec.row && popupCol === rec.col) {
      // refresh popup content
      popupChecks.querySelectorAll('input.chk').forEach(cb=>cb.checked=false);
      // re-render checks
      // for simplicity, close popup if opened by other user
      if(!popup.classList.contains('hidden')) {
        // optional: notify user
      }
    }
  }).subscribe();
}

/* ---------------------------
   Init
----------------------------*/
(async function init(){
  setStatus('初期化中...');
  await loadSheets();
  // If there was no sheet, create one
  const { data: sheets } = await supabase.from('sheets').select('*');
  if(!sheets || sheets.length===0){
    const { data } = await supabase.from('sheets').insert({ name:'Sheet1', max_rows:100, max_cols:100 }).select().single();
    await loadSheets();
  }
  setStatus('');
})();
