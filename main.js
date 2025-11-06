import { supabase } from "./supabase.js";

const TABLE_NAME = "main_sheet";
const tableElement = document.getElementById("sheet");
const popup = document.getElementById("popup");

let currentRow = null;
let currentCol = null;

/* -----------------------------
   ✅ 初期テーブル（100×100）を作成
-------------------------------- */
function createInitialTable() {
  for (let r = 0; r < 100; r++) {
    const tr = document.createElement("tr");
    for (let c = 0; c < 100; c++) {
      const td = document.createElement("td");
      td.textContent = "";
      td.onclick = () => openPopup(r, c, td);
      tr.appendChild(td);
    }
    tableElement.appendChild(tr);
  }
}

/* -----------------------------
   ✅ 吹き出し（ポップアップ）表示
-------------------------------- */
async function openPopup(row, col, td) {
  currentRow = row;
  currentCol = col;

  const rect = td.getBoundingClientRect();
  popup.style.top = `${rect.top + window.scrollY}px`;
  popup.style.left = `${rect.right + 10}px`;
  popup.classList.remove("hidden");

  const { data } = await supabase
    .from("cell_notes")
    .select("*")
    .eq("table_name", TABLE_NAME)
    .eq("row", row)
    .eq("col", col)
    .maybeSingle();

  // チェック項目反映
  document.querySelectorAll(".check-item").forEach(cb => {
    cb.checked = data?.checked_items?.includes(cb.value) || false;
  });

  // コメント反映
  document.getElementById("comment").value = data?.comment || "";
}

/* -----------------------------
   ✅ 保存
-------------------------------- */
document.getElementById("saveNote").onclick = async () => {
  const items = [...document.querySelectorAll(".check-item")]
    .filter(cb => cb.checked)
    .map(cb => cb.value);

  const comment = document.getElementById("comment").value;

  await supabase.from("cell_notes").upsert({
    table_name: TABLE_NAME,
    row: currentRow,
    col: currentCol,
    checked_items: items,
    comment,
    updated_at: new Date().toISOString()
  });

  popup.classList.add("hidden");
};

/* -----------------------------
   ✅ 閉じる
-------------------------------- */
document.getElementById("closePopup").onclick = () => {
  popup.classList.add("hidden");
};

createInitialTable();
