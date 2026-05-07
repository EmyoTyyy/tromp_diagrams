// ═══════════════════════════════════════
// SIDEBAR — definition list, add/edit/delete user defs
// ═══════════════════════════════════════

function renderSidebar() {
  const filter = (document.getElementById('filter')?.value || '').trim().toLowerCase();
  const matches = (name, expr) =>
    !filter || name.toLowerCase().includes(filter) || expr.toLowerCase().includes(filter);

  const catList = document.getElementById('catList');
  if (!catList) return;
  catList.innerHTML = '';
  for (const [catName, names] of CATEGORIES) {
    const filtered = names.filter(n => matches(n, BUILTIN_DEFS[n]));
    if (!filtered.length) continue;
    const cat = document.createElement('div');
    cat.className = 'def-cat';
    cat.innerHTML = `<h3>${catName}</h3><div class="def-list"></div>`;
    const list = cat.querySelector('.def-list');
    for (const n of filtered) list.appendChild(defEntry(n, BUILTIN_DEFS[n], false));
    catList.appendChild(cat);
  }

  const userCatsContainer = document.getElementById('userCatsContainer');
  if (userCatsContainer) {
    userCatsContainer.innerHTML = '';
    const byCategory = {};
    for (const [name, val] of Object.entries(userDefs)) {
      const cat = val.category || 'User';
      if (!matches(name, val.expr)) continue;
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(name);
    }
    const sortedCats = Object.keys(byCategory).sort();
    if (sortedCats.length === 0) {
      userCatsContainer.innerHTML = '<h3 style="font-size:0.65rem;letter-spacing:.15em;text-transform:uppercase;color:var(--muted);margin-bottom:8px;font-weight:400;">User</h3><div class="user-empty">no user definitions yet</div>';
    } else {
      for (const cat of sortedCats) {
        const div = document.createElement('div');
        div.className = 'def-cat';
        div.innerHTML =
          '<h3>' +
            '<span class="cat-name">' + escapeHTML(cat) + '</span>' +
            '<span class="cat-actions">' +
              '<button class="cat-action" data-act="rename" title="Rename category">✎</button>' +
              '<button class="cat-action" data-act="delete" title="Delete category">✕</button>' +
            '</span>' +
          '</h3>' +
          '<div class="def-list"></div>';
        const list = div.querySelector('.def-list');
        for (const n of byCategory[cat].sort()) list.appendChild(defEntry(n, userDefs[n].expr, true));
        attachCategoryDropTarget(div, cat);
        // Wire rename / delete buttons.
        div.querySelector('.cat-action[data-act="rename"]').onclick = (e) => {
          e.stopPropagation();
          renameUserCategory(cat);
        };
        div.querySelector('.cat-action[data-act="delete"]').onclick = (e) => {
          e.stopPropagation();
          deleteUserCategory(cat);
        };
        userCatsContainer.appendChild(div);
      }
      // Drop zone to create a brand-new category by dragging here.
      const newCatZone = document.createElement('div');
      newCatZone.className = 'def-cat new-cat-zone';
      newCatZone.innerHTML = '<div class="new-cat-hint">drop here to create a new category</div>';
      newCatZone.addEventListener('dragover', (e) => {
        if (!_draggedDefName) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        newCatZone.classList.add('drop-target');
      });
      newCatZone.addEventListener('dragleave', (e) => {
        if (!newCatZone.contains(e.relatedTarget)) newCatZone.classList.remove('drop-target');
      });
      newCatZone.addEventListener('drop', (e) => {
        e.preventDefault();
        newCatZone.classList.remove('drop-target');
        const name = _draggedDefName;
        if (!name) return;
        const def = userDefs[name];
        if (!def) return;
        const newCat = prompt('New category name:', '');
        if (!newCat) return;
        const trimmed = newCat.trim();
        if (!trimmed || trimmed === def.category) return;
        userDefs[name] = { expr: def.expr, category: trimmed };
        saveUserDefs(userDefs);
        renderSidebar();
      });
      userCatsContainer.appendChild(newCatZone);
    }
  }

  const datalist = document.getElementById('catOptions');
  if (datalist) {
    datalist.innerHTML = '';
    for (const cat of allUserCategories()) {
      const opt = document.createElement('option');
      opt.value = cat;
      datalist.appendChild(opt);
    }
  }
}

// Tracks which user def is currently being dragged (set on dragstart, cleared
// on dragend). dataTransfer would also work but a module-local var is simpler
// here since we don't need cross-window drops.
let _draggedDefName = null;

function defEntry(name, expr, isUser) {
  const div = document.createElement('div');
  div.className = 'def-entry' + (isUser ? ' user' : '');
  div.title = `${name} = ${expr}\n\nClick to insert${isUser ? ' · drag to a category to move' : ''}`;

  const nameSpan = document.createElement('span');
  nameSpan.className = 'def-name';
  nameSpan.textContent = name;
  div.appendChild(nameSpan);

  const exprSpan = document.createElement('span');
  exprSpan.className = 'def-expr';
  exprSpan.textContent = '= ' + expr.replace(/\\/g, 'λ');
  div.appendChild(exprSpan);

  div.onclick = (e) => {
    if (e.target.closest('.def-actions')) return;
    insertIntoExpr(name);
  };

  if (isUser) {
    div.draggable = true;
    div.dataset.defName = name;
    div.addEventListener('dragstart', (e) => {
      _draggedDefName = name;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', name);
      div.classList.add('dragging');
      // Light up every user category as a potential drop zone.
      document.querySelectorAll('#userCatsContainer .def-cat')
        .forEach(c => c.classList.add('drop-target-pending'));
    });
    div.addEventListener('dragend', () => {
      _draggedDefName = null;
      div.classList.remove('dragging');
      document.querySelectorAll('.def-cat.drop-target, .def-cat.drop-target-pending')
        .forEach(c => c.classList.remove('drop-target', 'drop-target-pending'));
    });

    const actions = document.createElement('span');
    actions.className = 'def-actions';
    const editBtn = document.createElement('button');
    editBtn.className = 'def-act-btn';
    editBtn.textContent = 'edit';
    editBtn.onclick = (e) => { e.stopPropagation(); editUserDef(name); };
    const delBtn = document.createElement('button');
    delBtn.className = 'def-act-btn del';
    delBtn.textContent = '✕';
    delBtn.onclick = (e) => { e.stopPropagation(); deleteUserDef(name); };
    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    div.appendChild(actions);
  }
  return div;
}

// Wires drag-and-drop on a user-category container. Dropping a def onto it
// re-categorizes the def (no-op if it's already in this category).
function attachCategoryDropTarget(catDiv, categoryName) {
  catDiv.addEventListener('dragover', (e) => {
    if (!_draggedDefName) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    catDiv.classList.add('drop-target');
  });
  catDiv.addEventListener('dragleave', (e) => {
    if (!catDiv.contains(e.relatedTarget)) catDiv.classList.remove('drop-target');
  });
  catDiv.addEventListener('drop', (e) => {
    e.preventDefault();
    catDiv.classList.remove('drop-target');
    const name = _draggedDefName;
    if (!name) return;
    const def = userDefs[name];
    if (!def || def.category === categoryName) return;
    userDefs[name] = { expr: def.expr, category: categoryName };
    saveUserDefs(userDefs);
    renderSidebar();
  });
}

function insertIntoExpr(name) {
  const input = document.getElementById('expr') || document.getElementById('exprArea');
  if (!input) return;
  const pos = input.selectionStart ?? input.value.length;
  const before = input.value.slice(0, pos);
  const after = input.value.slice(pos);
  const needSpaceBefore = before.length > 0 && !/\s$/.test(before) && !/[(\\.]$/.test(before);
  const needSpaceAfter = after.length > 0 && !/^\s/.test(after) && !/^[)\s]/.test(after);
  const insert = (needSpaceBefore ? ' ' : '') + name + (needSpaceAfter ? ' ' : '');
  input.value = before + insert + after;
  const newPos = before.length + insert.length;
  input.focus();
  input.setSelectionRange(newPos, newPos);
}

function showAddError(msg) {
  const el = document.getElementById('addErr');
  if (el) el.textContent = msg;
}

function isValidName(name) { return /^[a-zA-Z_][a-zA-Z0-9_']*$/.test(name); }

function addUserDef() {
  const name = document.getElementById('newName').value.trim();
  const expr = document.getElementById('newExpr').value.trim();
  const cat = document.getElementById('newCat').value.trim() || 'User';
  showAddError('');
  if (!name) return showAddError('name required');
  if (!isValidName(name)) return showAddError('invalid name (use letters/digits/_)');
  if (/^\d+$/.test(name)) return showAddError('name cannot be a numeral');
  if (!expr) return showAddError('expression required');
  try { parse(expr); } catch (e) { return showAddError('parse error: ' + e.message); }
  userDefs[name] = { expr, category: cat };
  saveUserDefs(userDefs);
  document.getElementById('newName').value = '';
  document.getElementById('newExpr').value = '';
  renderSidebar();
}

function editUserDef(name) {
  const current = userDefs[name];
  if (!current) return;
  const newExpr = prompt(`Edit definition of '${name}':`, current.expr);
  if (newExpr === null) return;
  const trimmed = newExpr.trim();
  if (!trimmed) return;
  try { parse(trimmed); } catch (e) { alert('Parse error: ' + e.message); return; }
  const newCat = prompt(`Category for '${name}':`, current.category || 'User');
  if (newCat === null) return;
  userDefs[name] = { expr: trimmed, category: newCat.trim() || 'User' };
  saveUserDefs(userDefs);
  renderSidebar();
}

function deleteUserDef(name) {
  if (!confirm(`Delete user definition '${name}'?`)) return;
  delete userDefs[name];
  saveUserDefs(userDefs);
  renderSidebar();
}

// Rename a user-defined category. All defs whose .category matches `oldName`
// get rebound to the new name. No-op if cancelled or unchanged.
function renameUserCategory(oldName) {
  const newName = prompt('Rename category:', oldName);
  if (newName === null) return;
  const trimmed = newName.trim();
  if (!trimmed || trimmed === oldName) return;
  let touched = 0;
  for (const [n, val] of Object.entries(userDefs)) {
    if ((val.category || 'User') === oldName) {
      userDefs[n] = { expr: val.expr, category: trimmed };
      touched++;
    }
  }
  if (!touched) return;
  saveUserDefs(userDefs);
  renderSidebar();
}

// Delete a user category. Defs in it are moved to the "User" fallback so no
// data is lost. Empty categories vanish silently.
function deleteUserCategory(name) {
  const inCat = Object.entries(userDefs).filter(([_, v]) => (v.category || 'User') === name);
  const msg = inCat.length === 0
    ? `Delete empty category '${name}'?`
    : `Delete category '${name}'?  Its ${inCat.length} definition${inCat.length === 1 ? '' : 's'} will move to "User".`;
  if (!confirm(msg)) return;
  for (const [n, val] of inCat) {
    userDefs[n] = { expr: val.expr, category: 'User' };
  }
  saveUserDefs(userDefs);
  renderSidebar();
}

function resetUserDefs() {
  if (!Object.keys(userDefs).length) return;
  if (!confirm('Delete all user definitions?')) return;
  userDefs = {};
  saveUserDefs(userDefs);
  renderSidebar();
}

function exportUserDefs() {
  const names = Object.keys(userDefs);
  if (!names.length) { alert('No user definitions to export.'); return; }
  const data = JSON.stringify(userDefs, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `tromp-defs-${date}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function importUserDefs(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (typeof data !== 'object' || data === null || Array.isArray(data)) {
        throw new Error('JSON must be an object mapping names to expressions');
      }
      const validated = {};
      for (const [name, val] of Object.entries(data)) {
        let expr, category;
        if (typeof val === 'string') { expr = val; category = 'User'; }
        else if (val && typeof val.expr === 'string') { expr = val.expr; category = val.category || 'User'; }
        else throw new Error(`'${name}': invalid entry`);
        if (!isValidName(name)) throw new Error(`'${name}': invalid name`);
        try { parse(expr); } catch (err) { throw new Error(`'${name}': ${err.message}`); }
        validated[name] = { expr, category };
      }
      const importedCount = Object.keys(validated).length;
      const conflicts = Object.keys(validated).filter(n => userDefs[n] !== undefined);
      let mode = 'merge';
      if (conflicts.length > 0) {
        const choice = prompt(
          `${conflicts.length} name(s) conflict with existing user definitions:\n` +
          `  ${conflicts.slice(0, 5).join(', ')}${conflicts.length > 5 ? ', ...' : ''}\n\n` +
          `Type "overwrite" to replace, "skip" to keep existing, or cancel.`,
          'overwrite'
        );
        if (choice === null) { event.target.value = ''; return; }
        const c = choice.trim().toLowerCase();
        if (c === 'overwrite' || c === 'o') mode = 'overwrite';
        else if (c === 'skip' || c === 's') mode = 'skip';
        else { alert('Cancelled.'); event.target.value = ''; return; }
      }
      let added = 0, replaced = 0, skipped = 0;
      for (const [name, val] of Object.entries(validated)) {
        if (userDefs[name] !== undefined) {
          if (mode === 'skip') { skipped++; continue; }
          replaced++;
        } else added++;
        userDefs[name] = val;
      }
      saveUserDefs(userDefs);
      renderSidebar();
      alert(`Imported ${importedCount} definition(s):\n  ${added} added, ${replaced} replaced, ${skipped} skipped`);
    } catch (err) { alert('Import failed: ' + err.message); }
    event.target.value = '';
  };
  reader.onerror = () => { alert('Failed to read file.'); event.target.value = ''; };
  reader.readAsText(file);
}
