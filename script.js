// ================================================================
// CONSTANTS & HELPERS
// ================================================================
const STORAGE_KEY = 'quotePro_data_v2';
const CATEGORIES = [
    { id: 'cctv-hd', label: 'CCTV Cameras HD', icon: 'fa-camera-retro' },
    { id: 'cctv-ip', label: 'CCTV Cameras IP', icon: 'fa-camera' },
    { id: 'biometric-access', label: 'Biometric Access', icon: 'fa-fingerprint' },
    { id: 'fire-alarms', label: 'Fire Alarms Service', icon: 'fa-fire-extinguisher' },
    { id: 'pa-system', label: 'PA System', icon: 'fa-bullhorn' },
    { id: 'video-door-phone', label: 'Video Door Phone', icon: 'fa-video' },
    { id: 'access-control', label: 'Access Control', icon: 'fa-door-open' },
    { id: 'networking', label: 'Networking', icon: 'fa-network-wired' }
];

function getStoredPassword() {
    let stored = localStorage.getItem('quotePro_admin_password');
    if (stored) return stored;
    const def = 'admin123';
    localStorage.setItem('quotePro_admin_password', def);
    return def;
}

function setStoredPassword(newPwd) {
    localStorage.setItem('quotePro_admin_password', newPwd);
}

function verifyPassword(input) {
    return input === getStoredPassword();
}

function getDefaultDoc() {
    return {
        quoteDate: new Date().toISOString().split('T')[0],
        quoteNo: '',
        poNo: '',
        projectArea: '',
        brandName: '',
        vendorName: '',
        vendorCompany: '',
        vendorAddress: '',
        vendorPhone: '',
        vendorEmail: '',
        vendorWebsite: '',
        vendorGst: '',
        clientName: '',
        clientCompany: '',
        clientAddress: '',
        clientPhone: '',
        clientGst: '',
        projectName: '',
        projectLocation: '',
        projectScope: '',
        projectStartDate: '',
        projectEndDate: '',
        projectManager: '',
        items: [],
        termsPayment: '',
        termsWarranty: '',
        termsSite: '',
        termsDeclaration: '',
        gstRate: 18,
        customerId: ''
    };
}

function getDefaultData() {
    return {
        quotation: { categories: {} },
        invoice: { categories: {} }
    };
}

function getCurrentMonthKey() {
    return new Date().toISOString().slice(0, 7);
}

function getMonthLabel(monthKey) {
    const [y, m] = monthKey.split('-').map(Number);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[m - 1] + ' ' + y;
}

function getCategoryLabel(id) {
    const found = CATEGORIES.find(c => c.id === id);
    return found ? found.label : id;
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function debounce(fn, ms) {
    let timer;
    return function(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), ms);
    };
}

let appData = loadData();

function loadData() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            let modified = false;
            // Ensure ERP arrays exist
            if (!parsed.customers) { parsed.customers = []; modified = true; }
            if (!parsed.products) { parsed.products = []; modified = true; }
            if (!parsed.payments) { parsed.payments = []; modified = true; }
            if (!parsed.invoices) { parsed.invoices = []; modified = true; }
            if (!parsed.quotations) { parsed.quotations = []; modified = true; }
            if (!parsed.quotation) { parsed.quotation = { categories: {} }; modified = true; }
            if (!parsed.invoice) { parsed.invoice = { categories: {} }; modified = true; }
            CATEGORIES.forEach(cat => {
                if (!parsed.quotation.categories[cat.id]) {
                    parsed.quotation.categories[cat.id] = { files: {} };
                    modified = true;
                }
                if (!parsed.invoice.categories[cat.id]) {
                    parsed.invoice.categories[cat.id] = { files: {} };
                    modified = true;
                }
            });
            // Ensure each file has all fields (including customerId)
            for (const docType of ['quotation', 'invoice']) {
                const cats = parsed[docType].categories;
                for (const catId in cats) {
                    const files = cats[catId].files;
                    for (const month in files) {
                        const file = files[month];
                        const defaults = getDefaultDoc();
                        for (const key in defaults) {
                            if (!(key in file)) {
                                file[key] = defaults[key];
                                modified = true;
                            }
                        }
                    }
                }
            }
            if (modified) localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
            return parsed;
        }
    } catch (_) {}
    const fresh = getDefaultData();
    fresh.customers = [];
    fresh.products = [];
    fresh.payments = [];
    fresh.invoices = [];
    fresh.quotations = [];
    CATEGORIES.forEach(cat => {
        fresh.quotation.categories[cat.id] = { files: {} };
        fresh.invoice.categories[cat.id] = { files: {} };
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
    return fresh;
}

function saveData(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function getDocTypeData() {
    return appData[currentDocType];
}

function getFile(categoryId, monthKey) {
    const docData = getDocTypeData();
    const cat = docData.categories[categoryId];
    return cat ? cat.files[monthKey] || null : null;
}

function setFile(categoryId, monthKey, fileData) {
    const docData = getDocTypeData();
    if (!docData.categories[categoryId]) docData.categories[categoryId] = { files: {} };
    docData.categories[categoryId].files[monthKey] = fileData;
    // Sync to ledger (invoices/quotations arrays)
    syncDocToLedger(fileData, currentDocType);
    saveData(appData);
    updateDashboard();
}

function deleteFile(categoryId, monthKey) {
    const docData = getDocTypeData();
    if (docData.categories[categoryId]) {
        const file = docData.categories[categoryId].files[monthKey];
        if (file) {
            // Remove from ledger arrays
            removeSyncedDoc(file, currentDocType);
        }
        delete docData.categories[categoryId].files[monthKey];
        saveData(appData);
        updateDashboard();
    }
}

// --- Sync bridge: keep appData.invoices / appData.quotations in sync ---
function syncDocToLedger(fileData, docType) {
    if (!fileData) return;
    // Compute total
    const sub = (fileData.items || []).reduce((s, item) => s + (Number(item.qty) || 0) * (Number(item.unitPrice) || 0), 0);
    const gst = sub * ((fileData.gstRate || 0) / 100);
    const total = sub + gst;
    const entry = {
        id: fileData.quoteNo || fileData.id,
        docDate: fileData.quoteDate,
        customerId: fileData.customerId || '',
        clientName: fileData.clientName || '',
        clientCompany: fileData.clientCompany || '',
        totalAmount: total,
        items: fileData.items || [],
        gstRate: fileData.gstRate || 18,
        _category: fileData._category || currentCategory,
        // preserve original fields
        ...fileData
    };
    const arr = docType === 'invoice' ? appData.invoices : appData.quotations;
    // Remove old entry with same id
    const idx = arr.findIndex(d => d.id === entry.id);
    if (idx !== -1) arr.splice(idx, 1);
    // Only add if it has a customer
    if (entry.customerId) {
        arr.push(entry);
    }
}

function removeSyncedDoc(fileData, docType) {
    if (!fileData) return;
    const arr = docType === 'invoice' ? appData.invoices : appData.quotations;
    const idx = arr.findIndex(d => d.id === fileData.quoteNo || d.id === fileData.id);
    if (idx !== -1) arr.splice(idx, 1);
}

function getAllMonthsForCategory(categoryId) {
    const docData = getDocTypeData();
    const cat = docData.categories[categoryId];
    return cat ? Object.keys(cat.files).sort() : [];
}

let currentDocType = 'quotation';
let currentCategory = CATEGORIES[0].id;
let currentMonth = getCurrentMonthKey();
let currentFileData = null;
let sortableInstance = null;
let categoryPieChart = null;
let monthlyBarChart = null;
let currentRole = 'viewer';

function getRole() {
    return localStorage.getItem('quotePro_role') || 'viewer';
}

function setRole(role) {
    localStorage.setItem('quotePro_role', role);
    currentRole = role;
    document.body.classList.remove('admin', 'viewer');
    document.body.classList.add(role);
    if (role === 'viewer') {
        document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
        document.querySelector('.role-indicator').textContent = 'Viewer';
        document.querySelector('.role-indicator').classList.add('viewer-role');
    } else {
        document.querySelectorAll('.admin-only').forEach(el => el.style.display = '');
        document.querySelector('.role-indicator').textContent = 'Admin';
        document.querySelector('.role-indicator').classList.remove('viewer-role');
    }
    document.querySelectorAll('.role-badge').forEach(el => {
        el.classList.toggle('active', el.dataset.role === role);
    });
    const pwdField = document.getElementById('passwordField');
    if (role === 'admin') {
        pwdField.classList.add('show');
        pwdField.style.display = 'block';
    } else {
        pwdField.classList.remove('show');
        pwdField.style.display = 'none';
    }
}

function requireAdmin(action) {
    if (currentRole !== 'admin') {
        toast('You need admin rights to perform this action.', 'error');
        return false;
    }
    return true;
}

function showLogin() {
    const overlay = document.getElementById('loginOverlay');
    overlay.style.display = 'flex';
    overlay.classList.remove('hidden');
    overlay.style.opacity = '1';
    overlay.style.pointerEvents = 'auto';
    document.getElementById('loginError').classList.remove('show');
}

function hideLogin() {
    document.getElementById('loginOverlay').style.display = 'none';
}

function handleLogin() {
    const activeBadge = document.querySelector('.role-badge.active');
    const role = activeBadge ? activeBadge.dataset.role : 'viewer';
    const password = document.getElementById('loginPassword').value;

    if (role === 'admin') {
        if (!verifyPassword(password)) {
            document.getElementById('loginError').classList.add('show');
            return;
        }
    }
    document.getElementById('loginError').classList.remove('show');

    setRole(role);
    hideLogin();
    toast('Logged in as ' + role, 'success');

    setTimeout(() => {
        renderCategories();
        loadCurrentFile();
        navigate('dashboard');
        populateCustomerDropdowns();
        renderCustomers();
        renderProducts();
        renderPayments();
        renderLedger();
        renderStatement();
    }, 100);
}

function logout() {
    localStorage.removeItem('quotePro_role');
    currentRole = 'viewer';
    document.body.classList.remove('admin', 'viewer');
    showLogin();
    toast('Logged out', 'info');
    document.getElementById('loginPassword').value = '';
    document.getElementById('loginError').classList.remove('show');
    closePasswordModal();
    closeSettingsModal();
}

function ensureCurrentFile() {
    let file = getFile(currentCategory, currentMonth);
    if (!file) {
        file = getDefaultDoc();
        setFile(currentCategory, currentMonth, file);
    }
    return file;
}

function loadCurrentFile() {
    currentFileData = ensureCurrentFile();
    renderFileToUI(currentFileData);
    renderMonthlyFilesList();
    updatePageTitle();
    initSortable();
    updateDashboard();
}

// ===== DASHBOARD =====
function updateDashboard() {
    // --- Stat cards ---
    const invoices = appData.invoices || [];
    const payments = appData.payments || [];
    const customers = appData.customers || [];
    const totalSales = invoices.reduce((s, i) => s + (i.totalAmount || 0), 0);
    const totalReceived = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const opening = customers.reduce((s, c) => s + (Number(c.openingBalance) || 0), 0);
    document.getElementById('statSales').textContent = '₹' + totalSales.toLocaleString('en-IN', { minimumFractionDigits: 2 });
    document.getElementById('statReceived').textContent = '₹' + totalReceived.toLocaleString('en-IN', { minimumFractionDigits: 2 });
    document.getElementById('statOutstanding').textContent = '₹' + (totalSales - totalReceived + opening).toLocaleString('en-IN', { minimumFractionDigits: 2 });
    document.getElementById('statCustomers').textContent = customers.length;

    // --- Recent Transactions ---
    const txns = [];
    invoices.forEach(i => txns.push({ date: i.docDate, type: 'Invoice', ref: i.id || i.quoteNo, amount: i.totalAmount || 0 }));
    payments.forEach(p => txns.push({ date: p.date, type: 'Payment', ref: p.id, amount: Number(p.amount) || 0 }));
    txns.sort((a, b) => new Date(b.date) - new Date(a.date));
    const tbody = document.getElementById('recentTransactionsBody');
    tbody.innerHTML = txns.slice(0, 8).map(t =>
        `<tr><td>${t.date || '-'}</td><td>${t.type}</td><td>${t.ref}</td><td style="text-align:right">₹${t.amount.toFixed(2)}</td></tr>`
    ).join('') || '<tr><td colspan="4">No transactions</td></tr>';

    // --- Top Customers ---
    const custRev = {};
    invoices.forEach(i => {
        if (i.customerId) custRev[i.customerId] = (custRev[i.customerId] || 0) + (i.totalAmount || 0);
    });
    const top = Object.entries(custRev).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const topBody = document.getElementById('topCustomersBody');
    topBody.innerHTML = top.map(([cid, amt]) => {
        const c = customers.find(x => x.id === cid) || { name: cid };
        return `<tr><td>${c.name}</td><td style="text-align:right">₹${amt.toFixed(2)}</td></tr>`;
    }).join('') || '<tr><td colspan="2">No data</td></tr>';

    // --- Charts (Category & Monthly) ---
    const catTotals = {};
    invoices.forEach(i => {
        const cat = i._category || 'uncategorized';
        catTotals[cat] = (catTotals[cat] || 0) + (i.totalAmount || 0);
    });
    const pieLabels = CATEGORIES.map(c => c.label);
    const pieData = CATEGORIES.map(c => catTotals[c.id] || 0);
    const pieCtx = document.getElementById('categoryPieChart');
    if (pieCtx) {
        if (categoryPieChart) categoryPieChart.destroy();
        const colors = ['#1a6e3a', '#2b6cb0', '#d69e2e', '#c53030', '#805ad5', '#ed8936', '#38a169', '#e53e3e'];
        categoryPieChart = new Chart(pieCtx, {
            type: 'pie',
            data: {
                labels: pieLabels,
                datasets: [{
                    data: pieData.length ? pieData : [1],
                    backgroundColor: pieData.length ? colors : ['#ccc'],
                    borderColor: 'var(--card-bg)',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            boxWidth: 12,
                            padding: 12,
                            font: { size: 10, weight: '600' },
                            color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() || '#64748b',
                            usePointStyle: true,
                            pointStyle: 'circle'
                        }
                    }
                },
                cutout: '45%'
            }
        });
    }

    const monthly = {};
    invoices.forEach(i => {
        const m = i.docDate?.slice(0, 7) || 'Unknown';
        monthly[m] = (monthly[m] || 0) + (i.totalAmount || 0);
    });
    const sorted = Object.keys(monthly).sort();
    const barCtx = document.getElementById('monthlyBarChart');
    if (barCtx) {
        if (monthlyBarChart) monthlyBarChart.destroy();
        monthlyBarChart = new Chart(barCtx, {
            type: 'bar',
            data: {
                labels: sorted.length ? sorted : ['No Data'],
                datasets: [{
                    label: 'Revenue',
                    data: sorted.length ? sorted.map(m => monthly[m]) : [0],
                    backgroundColor: '#1a6e3a'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true } }
            }
        });
    }
}

// ===== RENDER CATEGORIES =====
function renderCategories() {
    const list = document.getElementById('categoryList');
    if (!list) return;
    list.innerHTML = '';
    CATEGORIES.forEach(cat => {
        const li = document.createElement('li');
        li.dataset.id = cat.id;
        li.className = cat.id === currentCategory ? 'active' : '';
        li.innerHTML = `<i class="fas ${cat.icon}"></i> ${cat.label}`;
        list.appendChild(li);
    });
}

// ===== GLOBAL CATEGORY CLICK DELEGATION =====
function handleCategoryClick(e) {
    const li = e.target.closest('li');
    if (!li) return;
    const catId = li.dataset.id;
    if (catId) {
        switchCategory(catId);
        document.getElementById('sidebarDashTab').classList.remove('active');
    }
}

// ===== SWITCH CATEGORY =====
function switchCategory(catId) {
    if (catId === currentCategory) return;
    collectItemsAndSave();
    currentCategory = catId;
    const months = getAllMonthsForCategory(currentCategory);
    if (months.length === 0) {
        currentMonth = getCurrentMonthKey();
        setFile(currentCategory, currentMonth, getDefaultDoc());
    } else {
        currentMonth = months[months.length - 1];
    }
    document.querySelectorAll('.sidebar-categories li').forEach(el => {
        el.classList.toggle('active', el.dataset.id === catId);
    });
    document.getElementById('sidebarDashTab').classList.remove('active');

    currentFileData = ensureCurrentFile();
    renderFileToUI(currentFileData);
    renderMonthlyFilesList();
    updatePageTitle();
    initSortable();
    updateDashboard();

    closeSidebar();
    toast('Switched to ' + getCategoryLabel(catId), 'info');
    navigate(currentDocType);
}

function switchMonth(month) {
    if (month === currentMonth) return;
    collectItemsAndSave();
    currentMonth = month;
    loadCurrentFile();
    toast('Switched to ' + getMonthLabel(month), 'info');
}

function switchDocType(type) {
    if (type === currentDocType) return;
    collectItemsAndSave();
    currentDocType = type;
    currentCategory = CATEGORIES[0].id;
    const months = getAllMonthsForCategory(currentCategory);
    if (months.length === 0) {
        currentMonth = getCurrentMonthKey();
        setFile(currentCategory, currentMonth, getDefaultDoc());
    } else {
        currentMonth = months[months.length - 1];
    }
    currentFileData = ensureCurrentFile();
    renderFileToUI(currentFileData);
    renderMonthlyFilesList();
    updatePageTitle();
    initSortable();
    updateDashboard();
    document.getElementById('navQuotationTab').classList.toggle('active', currentDocType === 'quotation');
    document.getElementById('navInvoiceTab').classList.toggle('active', currentDocType === 'invoice');
    navigate(currentDocType);
    toast('Switched to ' + (type === 'quotation' ? 'Quotation' : 'Invoice'), 'info');
    closeSidebar();
}

function renderMonthlyFilesList() {
    const list = document.getElementById('monthlyFilesList');
    const months = getAllMonthsForCategory(currentCategory);
    if (months.length === 0) {
        list.innerHTML = '<li class="no-files-msg">No files for this category</li>';
        return;
    }
    list.innerHTML = '';
    months.forEach(month => {
        const li = document.createElement('li');
        li.className = month === currentMonth ? 'active-file' : '';
        const label = getMonthLabel(month);
        li.innerHTML = `
                <span>${label}</span>
                <div class="file-actions admin-only">
                    <button class="rename-btn" title="Rename" data-month="${month}"><i class="fas fa-pen"></i></button>
                    <button title="Delete" data-month="${month}"><i class="fas fa-trash"></i></button>
                </div>
            `;
        li.addEventListener('click', (e) => {
            if (e.target.closest('.file-actions')) return;
            switchMonth(month);
        });
        const delBtn = li.querySelector('.file-actions button:last-child');
        if (delBtn) {
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!requireAdmin('delete')) return;
                if (confirm(`Delete file for ${getMonthLabel(month)}?`)) {
                    deleteFile(currentCategory, month);
                    if (month === currentMonth) {
                        const remaining = getAllMonthsForCategory(currentCategory);
                        if (remaining.length > 0) currentMonth = remaining[remaining.length - 1];
                        else {
                            currentMonth = getCurrentMonthKey();
                            setFile(currentCategory, currentMonth, getDefaultDoc());
                        }
                        loadCurrentFile();
                    } else {
                        renderMonthlyFilesList();
                        updateDashboard();
                    }
                    toast('File deleted', 'info');
                }
            });
        }
        const renameBtn = li.querySelector('.file-actions .rename-btn');
        if (renameBtn) {
            renameBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!requireAdmin('rename')) return;
                const newMonth = prompt('Enter new month (YYYY-MM):', month);
                if (newMonth && /^\d{4}-\d{2}$/.test(newMonth)) {
                    const fileData = getFile(currentCategory, month);
                    if (fileData) {
                        setFile(currentCategory, newMonth, JSON.parse(JSON.stringify(fileData)));
                        deleteFile(currentCategory, month);
                        currentMonth = newMonth;
                        loadCurrentFile();
                        toast('File renamed', 'success');
                    }
                } else if (newMonth !== null) {
                    toast('Invalid format. Use YYYY-MM', 'error');
                }
            });
        }
        list.appendChild(li);
    });
}

function updatePageTitle() {
    const label = currentDocType === 'quotation' ? 'Quotation' : 'Invoice';
    document.getElementById('pageTitle').textContent = `${label} — ${getCategoryLabel(currentCategory)}`;
    document.getElementById('pageSubtitle').innerHTML =
        `<span style="color:var(--gold);font-weight:600;">${getCategoryLabel(currentCategory)}</span> &bull; <span>${getMonthLabel(currentMonth)}</span>`;
    document.getElementById('docTypeLabel').textContent = label;
    document.getElementById('navQuotationTab').classList.toggle('active', currentDocType === 'quotation');
    document.getElementById('navInvoiceTab').classList.toggle('active', currentDocType === 'invoice');
}

function renderFileToUI(file) {
    if (!file) return;
    const prefix = currentDocType === 'quotation' ? 'q_' : 'i_';
    const map = {
        quoteDate: prefix + 'quoteDate',
        quoteNo: prefix + 'quoteNo',
        poNo: prefix + 'poNo',
        projectArea: prefix + 'projectArea',
        brandName: prefix + 'brandName',
        vendorName: prefix + 'vendorName',
        vendorCompany: prefix + 'vendorCompany',
        vendorAddress: prefix + 'vendorAddress',
        vendorPhone: prefix + 'vendorPhone',
        vendorEmail: prefix + 'vendorEmail',
        vendorWebsite: prefix + 'vendorWebsite',
        vendorGst: prefix + 'vendorGst',
        clientName: prefix + 'clientName',
        clientCompany: prefix + 'clientCompany',
        clientAddress: prefix + 'clientAddress',
        clientPhone: prefix + 'clientPhone',
        clientGst: prefix + 'clientGst',
        projectName: prefix + 'projectName',
        projectLocation: prefix + 'projectLocation',
        projectScope: prefix + 'projectScope',
        projectStartDate: prefix + 'projectStartDate',
        projectEndDate: prefix + 'projectEndDate',
        projectManager: prefix + 'projectManager',
        termsPayment: prefix + 'termsPayment',
        termsWarranty: prefix + 'termsWarranty',
        termsSite: prefix + 'termsSite',
        termsDeclaration: prefix + 'termsDeclaration'
    };
    for (const [key, id] of Object.entries(map)) {
        const el = document.getElementById(id);
        if (el) el.value = file[key] || '';
    }
    const gstEl = document.getElementById(prefix + 'gstRate');
    if (file.gstRate !== undefined) gstEl.value = file.gstRate;
    // Set customer dropdown
    const custSelect = document.getElementById(prefix + 'docCustomerSelect');
    if (custSelect && file.customerId) {
        custSelect.value = file.customerId;
    }
    renderItems(file.items || []);
    updateTotals();
}

function renderItems(items) {
    const prefix = currentDocType === 'quotation' ? 'q_' : 'i_';
    const tbody = document.getElementById(prefix + 'itemsBody');
    if (!tbody) return;
    if (!items || items.length === 0) {
        tbody.innerHTML =
            `<tr><td colspan="6" style="text-align:center;padding:1.4rem;color:var(--text-muted);font-style:italic;">
                    <i class="fas fa-plus-circle" style="margin-right:6px;color:var(--gold);"></i> Add items below
                </td></tr>`;
        return;
    }
    let html = '';
    items.forEach((item, idx) => {
        const total = (Number(item.qty) || 0) * (Number(item.unitPrice) || 0);
        const sno = idx + 1;
        html += `
                <tr data-index="${idx}">
                    <td class="sno-cell">${sno}</td>
                    <td>
                        <div class="item-desc">
                            <input type="text" class="item-desc-input" value="${escapeHtml(item.description || '')}" placeholder="Description" />
                            <input type="text" class="hsn-small" value="${escapeHtml(item.hsn || '')}" placeholder="HSN" />
                        </div>
                    </td>
                    <td><input type="number" class="item-qty" value="${item.qty || 1}" min="1" step="1" style="width:50px;text-align:center;" /></td>
                    <td><input type="number" class="item-price" value="${item.unitPrice || 0}" min="0" step="0.01" style="width:80px;text-align:center;" /></td>
                    <td class="total-cell">₹${total.toFixed(2)}</td>
                    <td>
                        <div class="action-btns admin-only">
                            <button class="duplicate-btn" title="Duplicate"><i class="fas fa-copy"></i></button>
                            <button class="remove-btn" title="Remove"><i class="fas fa-times"></i></button>
                        </div>
                    </td>
                </tr>
            `;
    });
    tbody.innerHTML = html;

    tbody.querySelectorAll('tr').forEach(row => {
        const descInput = row.querySelector('.item-desc-input');
        const hsnInput = row.querySelector('.hsn-small');
        const qtyInput = row.querySelector('.item-qty');
        const priceInput = row.querySelector('.item-price');
        const totalCell = row.querySelector('.total-cell');
        const removeBtn = row.querySelector('.remove-btn');
        const dupBtn = row.querySelector('.duplicate-btn');

        const updateRow = () => {
            const qty = parseFloat(qtyInput.value) || 0;
            const price = parseFloat(priceInput.value) || 0;
            const total = qty * price;
            totalCell.textContent = '₹' + total.toFixed(2);
            updateTotalsFromDOM();
            scheduleSave();
        };

        qtyInput.addEventListener('input', updateRow);
        priceInput.addEventListener('input', updateRow);
        descInput.addEventListener('input', scheduleSave);
        hsnInput.addEventListener('input', scheduleSave);

        if (removeBtn) {
            removeBtn.addEventListener('click', function() {
                if (!requireAdmin('remove')) return;
                const tr = this.closest('tr');
                const idx = parseInt(tr.dataset.index);
                removeItem(idx);
            });
        }
        if (dupBtn) {
            dupBtn.addEventListener('click', function() {
                if (!requireAdmin('duplicate')) return;
                const tr = this.closest('tr');
                const idx = parseInt(tr.dataset.index);
                duplicateItem(idx);
            });
        }
    });
    initSortable();
    updateDashboard();
}

function collectItemsFromUI() {
    const prefix = currentDocType === 'quotation' ? 'q_' : 'i_';
    const items = [];
    const rows = document.querySelectorAll('#' + prefix + 'itemsBody tr');
    if (rows.length === 0 || (rows.length === 1 && rows[0].querySelector('td[colspan]'))) return items;
    rows.forEach(row => {
        const descInput = row.querySelector('.item-desc-input');
        const hsnInput = row.querySelector('.hsn-small');
        const qtyInput = row.querySelector('.item-qty');
        const priceInput = row.querySelector('.item-price');
        if (descInput && qtyInput && priceInput) {
            const desc = descInput.value.trim();
            const hsn = hsnInput ? hsnInput.value.trim() : '';
            const qty = parseFloat(qtyInput.value) || 0;
            const price = parseFloat(priceInput.value) || 0;
            if (desc || qty > 0 || price > 0) {
                items.push({ description: desc, hsn, qty, unitPrice: price });
            }
        }
    });
    return items;
}

function collectOtherFields() {
    if (!currentFileData) return;
    const prefix = currentDocType === 'quotation' ? 'q_' : 'i_';
    const fields = [
        'quoteDate', 'quoteNo', 'poNo', 'projectArea', 'brandName',
        'vendorName', 'vendorCompany', 'vendorAddress', 'vendorPhone', 'vendorEmail', 'vendorWebsite',
        'vendorGst',
        'clientName', 'clientCompany', 'clientAddress', 'clientPhone', 'clientGst',
        'projectName', 'projectLocation', 'projectScope', 'projectStartDate', 'projectEndDate',
        'projectManager',
        'termsPayment', 'termsWarranty', 'termsSite', 'termsDeclaration'
    ];
    fields.forEach(id => {
        const el = document.getElementById(prefix + id);
        if (el) currentFileData[id] = el.value;
    });
    const gstEl = document.getElementById(prefix + 'gstRate');
    currentFileData.gstRate = parseFloat(gstEl.value) || 0;
    // Capture customer from dropdown
    const custSelect = document.getElementById(prefix + 'docCustomerSelect');
    if (custSelect) {
        currentFileData.customerId = custSelect.value;
    }
}

const scheduleSave = debounce(function() {
    if (currentRole !== 'admin') return;
    collectItemsAndSave();
}, 400);

function collectItemsAndSave() {
    if (currentRole !== 'admin') return;
    if (!currentFileData) {
        currentFileData = getDefaultDoc();
        setFile(currentCategory, currentMonth, currentFileData);
    }
    currentFileData.items = collectItemsFromUI();
    collectOtherFields();
    setFile(currentCategory, currentMonth, currentFileData);
    renderMonthlyFilesList();
    updateDashboard();
}

function saveCurrentFile() {
    if (!requireAdmin('save')) return;
    collectItemsAndSave();
    toast('File saved successfully', 'success');
}

function getGSTRate() {
    const prefix = currentDocType === 'quotation' ? 'q_' : 'i_';
    const el = document.getElementById(prefix + 'gstRate');
    return parseFloat(el.value) || 0;
}

function updateTotalsFromDOM() {
    const prefix = currentDocType === 'quotation' ? 'q_' : 'i_';
    let subtotal = 0;
    const rows = document.querySelectorAll('#' + prefix + 'itemsBody tr');
    rows.forEach(row => {
        const qtyInput = row.querySelector('.item-qty');
        const priceInput = row.querySelector('.item-price');
        if (qtyInput && priceInput) {
            const qty = parseFloat(qtyInput.value) || 0;
            const price = parseFloat(priceInput.value) || 0;
            subtotal += qty * price;
        }
    });
    const gstRate = getGSTRate();
    const gst = subtotal * (gstRate / 100);
    const total = subtotal + gst;
    document.getElementById(prefix + 'subtotalDisplay').textContent = '₹' + subtotal.toFixed(2);
    document.getElementById(prefix + 'gstDisplay').textContent = '₹' + gst.toFixed(2);
    document.getElementById(prefix + 'totalDisplay').textContent = '₹' + total.toFixed(2);
    document.getElementById(prefix + 'amountWords').textContent = numberToWords(total);
}

function updateTotals() {
    const prefix = currentDocType === 'quotation' ? 'q_' : 'i_';
    const items = currentFileData?.items || [];
    let subtotal = 0;
    items.forEach(item => {
        subtotal += (Number(item.qty) || 0) * (Number(item.unitPrice) || 0);
    });
    const gstRate = getGSTRate();
    const gst = subtotal * (gstRate / 100);
    const total = subtotal + gst;
    document.getElementById(prefix + 'subtotalDisplay').textContent = '₹' + subtotal.toFixed(2);
    document.getElementById(prefix + 'gstDisplay').textContent = '₹' + gst.toFixed(2);
    document.getElementById(prefix + 'totalDisplay').textContent = '₹' + total.toFixed(2);
    document.getElementById(prefix + 'amountWords').textContent = numberToWords(total);
}

function numberToWords(num) {
    if (num === 0) return 'Zero';
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
        'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
    ];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const numStr = num.toFixed(2);
    const parts = numStr.split('.');
    const rupees = parseInt(parts[0]);
    const paise = parseInt(parts[1]);

    function convert(n) {
        if (n === 0) return '';
        if (n < 20) return ones[n];
        if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + ones[n % 10] : '');
        if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' ' + convert(n % 100) :
            '');
        if (n < 100000) return convert(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 !== 0 ? ' ' + convert(n %
            1000) : '');
        if (n < 10000000) return convert(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 !== 0 ? ' ' + convert(
            n % 100000) : '');
        return convert(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 !== 0 ? ' ' + convert(n % 10000000) :
            '');
    }
    let result = convert(rupees);
    if (paise > 0) result += ' and ' + convert(paise) + ' Paise';
    return result + ' Only';
}

function removeItem(idx) {
    if (!requireAdmin('remove')) return;
    if (!currentFileData) return;
    const items = currentFileData.items || [];
    if (idx >= 0 && idx < items.length) {
        items.splice(idx, 1);
        currentFileData.items = items;
        setFile(currentCategory, currentMonth, currentFileData);
        renderFileToUI(currentFileData);
        renderMonthlyFilesList();
        toast('Item removed', 'info');
    }
}

function duplicateItem(idx) {
    if (!requireAdmin('duplicate')) return;
    if (!currentFileData) return;
    const items = currentFileData.items || [];
    if (idx >= 0 && idx < items.length) {
        const newItem = JSON.parse(JSON.stringify(items[idx]));
        items.splice(idx + 1, 0, newItem);
        currentFileData.items = items;
        setFile(currentCategory, currentMonth, currentFileData);
        renderFileToUI(currentFileData);
        renderMonthlyFilesList();
        toast('Item duplicated', 'success');
    }
}

function addNewItem() {
    if (!requireAdmin('add')) return;
    const prefix = currentDocType === 'quotation' ? 'q_' : 'i_';
    const desc = document.getElementById(prefix + 'newItemDesc').value.trim();
    const hsn = document.getElementById(prefix + 'newItemHsn').value.trim();
    const qty = parseFloat(document.getElementById(prefix + 'newItemQty').value) || 1;
    const price = parseFloat(document.getElementById(prefix + 'newItemPrice').value) || 0;
    if (!desc && qty === 0 && price === 0) {
        toast('Please enter item description', 'error');
        return;
    }
    if (!currentFileData) {
        currentFileData = getDefaultDoc();
        setFile(currentCategory, currentMonth, currentFileData);
    }
    if (!currentFileData.items) currentFileData.items = [];
    currentFileData.items.push({ description: desc || 'Item', hsn, qty, unitPrice: price });
    setFile(currentCategory, currentMonth, currentFileData);
    renderFileToUI(currentFileData);
    renderMonthlyFilesList();
    document.getElementById(prefix + 'newItemDesc').value = '';
    document.getElementById(prefix + 'newItemHsn').value = '';
    document.getElementById(prefix + 'newItemQty').value = '1';
    document.getElementById(prefix + 'newItemPrice').value = '0';
    toast('Item added', 'success');
}

function initSortable() {
    const prefix = currentDocType === 'quotation' ? 'q_' : 'i_';
    const tbody = document.getElementById(prefix + 'itemsBody');
    if (!tbody) return;
    if (sortableInstance) sortableInstance.destroy();
    sortableInstance = new Sortable(tbody, {
        animation: 150,
        handle: '.sno-cell',
        onEnd: function() {
            if (currentRole !== 'admin') return;
            const items = collectItemsFromUI();
            if (currentFileData) {
                currentFileData.items = items;
                setFile(currentCategory, currentMonth, currentFileData);
                renderItems(items);
                updateTotals();
                renderMonthlyFilesList();
                toast('Items reordered', 'info');
            }
        }
    });
}

function getNextMonthKey() {
    const months = getAllMonthsForCategory(currentCategory);
    if (months.length === 0) {
        return getCurrentMonthKey();
    }
    const lastMonth = months[months.length - 1];
    const [year, month] = lastMonth.split('-').map(Number);
    let nextMonth = month + 1;
    let nextYear = year;
    if (nextMonth > 12) {
        nextMonth = 1;
        nextYear += 1;
    }
    return nextYear + '-' + String(nextMonth).padStart(2, '0');
}

function createNewFile() {
    if (!requireAdmin('create file')) return;
    const month = getNextMonthKey();
    if (getFile(currentCategory, month)) {
        toast('File already exists for ' + getMonthLabel(month), 'error');
        return;
    }
    setFile(currentCategory, month, getDefaultDoc());
    currentMonth = month;
    loadCurrentFile();
    toast('New file created for ' + getMonthLabel(month), 'success');
    navigate(currentDocType);
}

function deleteCurrentFile() {
    if (!requireAdmin('delete')) return;
    const months = getAllMonthsForCategory(currentCategory);
    if (months.length <= 1) {
        toast('Cannot delete the last file. Create a new one first.', 'error');
        return;
    }
    if (!confirm(`Delete file for ${getMonthLabel(currentMonth)}?`)) return;
    deleteFile(currentCategory, currentMonth);
    const remaining = getAllMonthsForCategory(currentCategory);
    if (remaining.length > 0) currentMonth = remaining[remaining.length - 1];
    else {
        currentMonth = getCurrentMonthKey();
        setFile(currentCategory, currentMonth, getDefaultDoc());
    }
    loadCurrentFile();
    toast('File deleted', 'info');
}

function downloadPDF(elementId, label) {
    collectItemsAndSave();
    const element = document.getElementById(elementId);
    if (!element) {
        toast('No document to export', 'error');
        return;
    }
    const opt = {
        margin: 0.4,
        filename: `${label || 'document'}_${Date.now()}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
    };
    toast('Generating PDF...', 'info');
    html2pdf().set(opt).from(element).save().then(() => {
        toast('PDF downloaded!', 'success');
    }).catch(err => {
        toast('PDF generation failed', 'error');
        console.error(err);
    });
}

function exportCSV() {
    if (!requireAdmin('export CSV')) return;
    const items = currentFileData?.items || [];
    if (items.length === 0) {
        toast('No items to export.', 'error');
        return;
    }
    let csv = 'Description,HSN,Qty,Unit Price,Total\n';
    items.forEach(item => {
        const total = (Number(item.qty) || 0) * (Number(item.unitPrice) || 0);
        csv += `"${item.description || ''}","${item.hsn || ''}",${item.qty || 0},${item.unitPrice || 0},${total.toFixed(2)}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Items_${currentDocType}_${currentCategory}_${currentMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast('CSV exported', 'success');
    closeSettingsModal();
}

function exportData() {
    if (!requireAdmin('export')) return;
    const dataStr = JSON.stringify(appData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `QuotePro_Backup_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Data exported', 'success');
    closeSettingsModal();
}

function importData(event) {
    if (!requireAdmin('import')) return;
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const imported = JSON.parse(e.target.result);
            if (imported.quotation && imported.invoice) {
                appData = imported;
                saveData(appData);
                loadCurrentFile();
                renderCategories();
                updateDashboard();
                toast('Data imported successfully!', 'success');
            } else {
                toast('Invalid file format', 'error');
            }
        } catch (err) {
            toast('Failed to import data', 'error');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
    closeSettingsModal();
}

function toast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const el = document.createElement('div');
    const icon = type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' :
        'fa-info-circle';
    el.className = `toast toast-${type}`;
    el.innerHTML = `<i class="fas ${icon}"></i> ${message}`;
    container.appendChild(el);
    setTimeout(() => {
        el.style.opacity = '0';
        el.style.transform = 'translateX(20px) scale(0.95)';
        setTimeout(() => el.remove(), 400);
    }, 3200);
}

function openSidebar() {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebarOverlay').classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('open');
    document.body.style.overflow = '';
}

function openSettingsModal() {
    document.getElementById('settingsModalOverlay').classList.add('open');
}

function closeSettingsModal() {
    document.getElementById('settingsModalOverlay').classList.remove('open');
}

function openPasswordModal() {
    if (currentRole !== 'admin') {
        toast('Only admin can change password.', 'error');
        return;
    }
    document.getElementById('passwordModalOverlay').classList.add('open');
    document.getElementById('pwdCurrent').value = '';
    document.getElementById('pwdNew').value = '';
    document.getElementById('pwdConfirm').value = '';
    document.getElementById('pwdError').classList.remove('show');
    document.getElementById('pwdSuccess').classList.remove('show');
    setTimeout(() => document.getElementById('pwdCurrent').focus(), 200);
    closeSettingsModal();
}

function closePasswordModal() {
    document.getElementById('passwordModalOverlay').classList.remove('open');
}

function changePassword() {
    const current = document.getElementById('pwdCurrent').value;
    const newPwd = document.getElementById('pwdNew').value;
    const confirmPwd = document.getElementById('pwdConfirm').value;
    const errorEl = document.getElementById('pwdError');
    const successEl = document.getElementById('pwdSuccess');
    errorEl.classList.remove('show');
    successEl.classList.remove('show');

    if (!verifyPassword(current)) {
        errorEl.textContent = '❌ Current password is incorrect.';
        errorEl.classList.add('show');
        return;
    }
    if (newPwd.length < 4) {
        errorEl.textContent = '❌ New password must be at least 4 characters.';
        errorEl.classList.add('show');
        return;
    }
    if (newPwd !== confirmPwd) {
        errorEl.textContent = '❌ Passwords do not match.';
        errorEl.classList.add('show');
        return;
    }
    setStoredPassword(newPwd);
    successEl.textContent = '✅ Password changed successfully!';
    successEl.classList.add('show');
    document.getElementById('pwdCurrent').value = '';
    document.getElementById('pwdNew').value = '';
    document.getElementById('pwdConfirm').value = '';
    toast('Password changed successfully!', 'success');
    setTimeout(closePasswordModal, 1500);
}

function toggleDarkMode() {
    const current = document.documentElement.getAttribute('data-theme');
    const newTheme = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('quotePro_theme', newTheme);
    const btn = document.querySelector('.btn-setting i.fa-moon, .btn-setting i.fa-sun');
    if (btn) {
        btn.className = newTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    }
    if (categoryPieChart) {
        categoryPieChart.options.plugins.legend.labels.color = getComputedStyle(document.documentElement)
            .getPropertyValue('--text-secondary').trim() || '#64748b';
        categoryPieChart.update();
    }
    if (monthlyBarChart) {
        monthlyBarChart.options.scales.y.ticks.color = getComputedStyle(document.documentElement)
            .getPropertyValue('--text-muted').trim() || '#94a3b8';
        monthlyBarChart.options.scales.x.ticks.color = getComputedStyle(document.documentElement)
            .getPropertyValue('--text-muted').trim() || '#94a3b8';
        monthlyBarChart.update();
    }
    toast(`Switched to ${newTheme} mode`, 'info');
    closeSettingsModal();
}

function navigate(pageId) {
    document.querySelectorAll('.page').forEach(el => el.classList.remove('active'));

    let target = null;

    if (pageId === 'dashboard') {
        target = document.getElementById('page-dashboard');
        document.getElementById('sidebarDashTab').classList.add('active');
        document.querySelectorAll('.sidebar-categories li').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('#erpModulesList li').forEach(el => el.classList.remove('active'));
        document.getElementById('pageSubtitle').innerHTML =
            `<span style="color:var(--gold);font-weight:600;">Analytics</span> &bull; <span>Real-time overview</span>`;
        document.getElementById('pageTitle').textContent = 'Dashboard';
    } else if (['customers', 'products', 'ledger', 'statement', 'payment'].includes(pageId)) {
        target = document.getElementById('page-' + pageId);
        document.getElementById('sidebarDashTab').classList.remove('active');
        document.querySelectorAll('.sidebar-categories li').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('#erpModulesList li').forEach(el => el.classList.remove('active'));
        const navMap = {
            'customers': 'navCustomers',
            'products': 'navProducts',
            'ledger': 'navLedger',
            'statement': 'navStatement',
            'payment': 'navPayment'
        };
        const navId = navMap[pageId];
        if (navId) document.getElementById(navId).classList.add('active');
        const titles = {
            'customers': 'Customers Directory',
            'products': 'Products Master',
            'ledger': 'Customer Ledger',
            'statement': 'Statement of Account',
            'payment': 'Payment Receipt'
        };
        document.getElementById('pageTitle').textContent = titles[pageId] || pageId;
        document.getElementById('pageSubtitle').innerHTML =
            `<span style="color:var(--gold);font-weight:600;">${titles[pageId] || pageId}</span> &bull; <span>Manage</span>`;
        // Refresh module data
        if (pageId === 'customers') renderCustomers();
        if (pageId === 'products') renderProducts();
        if (pageId === 'payment') renderPayments();
        if (pageId === 'ledger') renderLedger();
        if (pageId === 'statement') renderStatement();
        if (pageId === 'customers' || pageId === 'payment' || pageId === 'ledger' || pageId === 'statement') {
            populateCustomerDropdowns();
        }
    } else {
        const docType = (pageId === 'quotation' || pageId === 'invoice') ? pageId : currentDocType;
        target = document.getElementById('page-' + docType);
        document.getElementById('sidebarDashTab').classList.remove('active');
        document.querySelectorAll('.sidebar-categories li').forEach(el => {
            el.classList.toggle('active', el.dataset.id === currentCategory);
        });
        document.getElementById('navQuotationTab').classList.toggle('active', docType === 'quotation');
        document.getElementById('navInvoiceTab').classList.toggle('active', docType === 'invoice');
        updatePageTitle();
    }

    if (target) target.classList.add('active');

    document.querySelectorAll('.bottom-nav button').forEach(el => {
        const btnPage = el.dataset.page;
        const btnType = el.dataset.doctype;
        let active = false;
        if (pageId === 'dashboard' && btnPage === 'dashboard') active = true;
        else if (pageId === 'quotation' && btnType === 'quotation') active = true;
        else if (pageId === 'invoice' && btnType === 'invoice') active = true;
        el.classList.toggle('active', active);
    });

    closeSidebar();
}

// ===== CUSTOMER / PRODUCT DROPDOWNS =====
function populateCustomerDropdowns() {
    const customers = appData.customers || [];
    const opts = '<option value="">-- Select --</option>' + customers.map(c =>
        `<option value="${c.id}">${c.name} ${c.company ? '('+c.company+')' : ''}</option>`
    ).join('');
    ['q_docCustomerSelect', 'i_docCustomerSelect', 'ledgerCustomerSelect', 'statementCustomerSelect', 'payCustomer'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = opts;
    });
    const filter = document.getElementById('sidebarCustomerFilter');
    if (filter) {
        filter.innerHTML = '<option value="">All Customers</option>' + customers.map(c =>
            `<option value="${c.id}">${c.name}</option>`
        ).join('');
    }
}

function fillDocCustomer(prefix) {
    const select = document.getElementById(prefix + 'docCustomerSelect');
    const custId = select.value;
    const c = (appData.customers || []).find(x => x.id === custId);
    if (c && currentFileData) {
        document.getElementById(prefix + 'clientName').value = c.name;
        currentFileData.clientName = c.name;
        document.getElementById(prefix + 'clientCompany').value = c.company || '';
        currentFileData.clientCompany = c.company || '';
        document.getElementById(prefix + 'clientPhone').value = c.phone || '';
        currentFileData.clientPhone = c.phone || '';
        document.getElementById(prefix + 'clientGst').value = c.gstin || '';
        currentFileData.clientGst = c.gstin || '';
        currentFileData.customerId = c.id;
        // Use setFile to trigger sync
        setFile(currentCategory, currentMonth, currentFileData);
        toast('Customer linked to document', 'success');
    }
}

// ===== CUSTOMERS CRUD =====
function renderCustomers() {
    const tbody = document.getElementById('customersBody');
    if (!tbody) return;
    const customers = appData.customers || [];
    tbody.innerHTML = customers.length ? customers.map(c => `<tr>
        <td>${c.id}</td><td style="font-weight:bold">${c.name}<br/><span style="font-size:0.8em;font-weight:normal;color:var(--text-secondary);">${c.company||'-'}</span></td><td>${c.phone||'-'}</td><td>${c.email||'-'}</td><td>${c.gstin||'-'}</td>
        <td>₹${Number(c.openingBalance||0).toFixed(2)}</td>
        <td style="text-align:right">
            <button class="btn-icon info" onclick="openCustomerModal('${c.id}')"><i class="fas fa-edit"></i></button>
            <button class="btn-icon danger" onclick="deleteCustomer('${c.id}')"><i class="fas fa-trash"></i></button>
        </td>
    </tr>`).join('') : '<tr><td colspan="7"><div class="empty-state"><i class="fas fa-users"></i><p>No customers found. Add your first customer!</p></div></td></tr>';
}

function openCustomerModal(id = null) {
    document.getElementById('customerModal').classList.add('open');
    if (id) {
        const c = (appData.customers || []).find(x => x.id === id);
        if (c) {
            document.getElementById('custId').value = c.id;
            document.getElementById('custName').value = c.name;
            document.getElementById('custCompany').value = c.company || '';
            document.getElementById('custAddress').value = c.address || '';
            document.getElementById('custPhone').value = c.phone || '';
            document.getElementById('custEmail').value = c.email || '';
            document.getElementById('custGstin').value = c.gstin || '';
            document.getElementById('custOpeningBal').value = c.openingBalance || 0;
            document.getElementById('customerModalTitle').textContent = 'Edit Customer';
        }
    } else {
        ['custId','custName','custCompany','custAddress','custPhone','custEmail','custGstin'].forEach(f => document.getElementById(f).value = '');
        document.getElementById('custOpeningBal').value = '0';
        document.getElementById('customerModalTitle').textContent = 'Add Customer';
    }
}

function closeCustomerModal() { document.getElementById('customerModal').classList.remove('open'); }

function saveCustomer() {
    const id = document.getElementById('custId').value || 'CUST-' + Date.now();
    const name = document.getElementById('custName').value.trim();
    if (!name) return toast('Customer name required');
    const cust = {
        id, name,
        company: document.getElementById('custCompany').value,
        address: document.getElementById('custAddress').value,
        phone: document.getElementById('custPhone').value,
        email: document.getElementById('custEmail').value,
        gstin: document.getElementById('custGstin').value,
        openingBalance: Number(document.getElementById('custOpeningBal').value) || 0
    };
    if (!appData.customers) appData.customers = [];
    const idx = appData.customers.findIndex(x => x.id === id);
    if (idx !== -1) appData.customers[idx] = cust;
    else appData.customers.push(cust);
    saveData(appData);
    closeCustomerModal();
    renderCustomers();
    populateCustomerDropdowns();
    toast('Customer saved');
}

function deleteCustomer(id) {
    if (confirm('Delete customer and all related records?')) {
        appData.customers = (appData.customers || []).filter(c => c.id !== id);
        appData.quotations = (appData.quotations || []).filter(q => q.customerId !== id);
        appData.invoices = (appData.invoices || []).filter(i => i.customerId !== id);
        appData.payments = (appData.payments || []).filter(p => p.customerId !== id);
        saveData(appData);
        renderCustomers();
        populateCustomerDropdowns();
        toast('Customer deleted');
    }
}

// ===== PRODUCTS CRUD =====
function renderProducts() {
    const tbody = document.getElementById('productsBody');
    if (!tbody) return;
    const products = appData.products || [];
    tbody.innerHTML = products.length ? products.map(p => `<tr>
        <td>${p.id}</td><td style="font-weight:bold">${p.name}</td><td>${p.hsn||'-'}</td><td>₹${Number(p.price||0).toFixed(2)}</td><td>${CATEGORIES.find(c=>c.id===p.category)?.label || p.category}</td>
        <td style="text-align:right">
            <button class="btn-icon info" onclick="openProductModal('${p.id}')"><i class="fas fa-edit"></i></button>
            <button class="btn-icon danger" onclick="deleteProduct('${p.id}')"><i class="fas fa-trash"></i></button>
        </td>
    </tr>`).join('') : '<tr><td colspan="6"><div class="empty-state"><i class="fas fa-box-open"></i><p>No products found. Add products to your master catalogue!</p></div></td></tr>';
}

function openProductModal(id = null) {
    document.getElementById('productModal').classList.add('open');
    const catSelect = document.getElementById('prodCategory');
    catSelect.innerHTML = CATEGORIES.map(c => `<option value="${c.id}">${c.label}</option>`).join('');
    if (id) {
        const p = (appData.products || []).find(x => x.id === id);
        if (p) {
            document.getElementById('prodId').value = p.id;
            document.getElementById('prodName').value = p.name;
            document.getElementById('prodHsn').value = p.hsn || '';
            document.getElementById('prodPrice').value = p.price || 0;
            document.getElementById('prodCategory').value = p.category || CATEGORIES[0].id;
            document.getElementById('productModalTitle').textContent = 'Edit Product';
        }
    } else {
        ['prodId','prodName','prodHsn','prodPrice'].forEach(f => document.getElementById(f).value = '');
        document.getElementById('productModalTitle').textContent = 'Add Product';
    }
}

function closeProductModal() { document.getElementById('productModal').classList.remove('open'); }

function saveProduct() {
    const id = document.getElementById('prodId').value || 'PROD-' + Date.now();
    const name = document.getElementById('prodName').value.trim();
    if (!name) return toast('Product name required');
    const price = Number(document.getElementById('prodPrice').value);
    if (isNaN(price) || price < 0) return toast('Invalid price');
    const prod = {
        id, name,
        hsn: document.getElementById('prodHsn').value,
        price,
        category: document.getElementById('prodCategory').value
    };
    if (!appData.products) appData.products = [];
    const idx = appData.products.findIndex(x => x.id === id);
    if (idx !== -1) appData.products[idx] = prod;
    else appData.products.push(prod);
    saveData(appData);
    closeProductModal();
    renderProducts();
    populateProductDropdown();
    toast('Product saved');
}

function deleteProduct(id) {
    if (confirm('Delete product?')) {
        appData.products = (appData.products || []).filter(p => p.id !== id);
        saveData(appData);
        renderProducts();
        populateProductDropdown();
        toast('Product deleted');
    }
}

function populateProductDropdown() {
    const sel = document.getElementById('productMasterSelect');
    if (!sel) return;
    const filtered = (appData.products || []).filter(p => p.category === currentCategory);
    sel.innerHTML = '<option value="">-- Choose from Master --</option>' + filtered.map(p =>
        `<option value="${p.id}">${p.name} (₹${p.price})</option>`
    ).join('');
}

// ===== PAYMENTS =====
function renderPayments() {
    const tbody = document.getElementById('paymentsBody');
    if (!tbody) return;
    const payments = appData.payments || [];
    tbody.innerHTML = payments.length ? payments.map(p => {
        const c = (appData.customers || []).find(x => x.id === p.customerId);
        return `<tr><td>${p.date}</td><td>${p.id}</td><td>${c?c.name:'-'}</td><td>${p.invoiceId||'-'}</td><td style="text-align:right">₹${(p.amount||0).toFixed(2)}</td><td>${p.mode}</td><td>${p.reference||''}</td><td style="text-align:right" class="no-print"><button class="btn-icon danger" onclick="deletePayment('${p.id}')"><i class="fas fa-trash"></i></button></td></tr>`;
    }).join('') : '<tr><td colspan="8"><div class="empty-state"><i class="fas fa-receipt"></i><p>No payment records found</p></div></td></tr>';
    document.getElementById('payDate').value = getCurrentMonthKey() + '-01';
}

function recordPayment() {
    if (!requireAdmin('record payment')) return;
    const customerId = document.getElementById('payCustomer').value;
    const amount = Number(document.getElementById('payAmount').value);
    if (!customerId || isNaN(amount) || amount <= 0) return toast('Please select a customer and enter a valid amount');
    const payment = {
        id: 'PAY-' + Date.now(),
        customerId,
        invoiceId: document.getElementById('payInvoice').value || null,
        date: document.getElementById('payDate').value || getCurrentMonthKey() + '-01',
        amount,
        mode: document.getElementById('payMode').value,
        reference: document.getElementById('payRef').value
    };
    if (!appData.payments) appData.payments = [];
    appData.payments.push(payment);
    saveData(appData);
    renderPayments();
    document.getElementById('payAmount').value = '';
    document.getElementById('payRef').value = '';
    toast('Payment recorded');
}

function deletePayment(id) {
    if (confirm('Delete payment?')) {
        appData.payments = (appData.payments || []).filter(p => p.id !== id);
        saveData(appData);
        renderPayments();
        toast('Payment deleted');
    }
}

// ===== LEDGER & STATEMENT =====
function renderLedger() {
    const custId = document.getElementById('ledgerCustomerSelect').value;
    const tbody = document.getElementById('ledgerBody');
    const tfoot = document.getElementById('ledgerFoot');
    if (!custId) { tbody.innerHTML = '<tr><td colspan="6">Select customer</td></tr>'; tfoot.innerHTML = ''; return; }
    const cust = (appData.customers || []).find(c => c.id === custId);
    if (!cust) return;
    const invoices = (appData.invoices || []).filter(i => i.customerId === custId);
    const payments = (appData.payments || []).filter(p => p.customerId === custId);
    const entries = [];
    const opb = cust.openingBalance || 0;
    if (opb) entries.push({ date: '2000-01-01', displayDate: '-', particulars: 'Opening Balance', voucher: 'OPB', debit: opb > 0 ? opb : 0, credit: opb < 0 ? Math.abs(opb) : 0, balance: opb });
    invoices.forEach(i => entries.push({ date: i.docDate, displayDate: i.docDate, particulars: 'Invoice', voucher: i.id || i.quoteNo, debit: i.totalAmount || 0, credit: 0 }));
    payments.forEach(p => entries.push({ date: p.date, displayDate: p.date, particulars: 'Payment', voucher: p.id, debit: 0, credit: p.amount || 0 }));
    entries.sort((a, b) => new Date(a.date) - new Date(b.date));
    let bal = 0;
    entries.forEach(e => { bal = bal + e.debit - e.credit; e.balance = bal; });
    tbody.innerHTML = entries.map(e => `<tr><td>${e.displayDate}</td><td>${e.particulars}</td><td>${e.voucher}</td><td style="text-align:right">${e.debit>0?e.debit.toFixed(2):'-'}</td><td style="text-align:right">${e.credit>0?e.credit.toFixed(2):'-'}</td><td style="text-align:right; font-weight:bold; color:${e.balance>=0?'inherit':'var(--success)'}">${e.balance>=0?e.balance.toFixed(2)+' Dr':Math.abs(e.balance).toFixed(2)+' Cr'}</td></tr>`).join('');
    tfoot.innerHTML = `<tr><td colspan="3" style="font-weight:bold;">TOTAL</td><td style="text-align:right; color:var(--danger); font-weight:bold;">${entries.reduce((s,e)=>s+e.debit,0).toFixed(2)}</td><td style="text-align:right; color:var(--success); font-weight:bold;">${entries.reduce((s,e)=>s+e.credit,0).toFixed(2)}</td><td></td></tr>`;
}

function renderStatement() {
    const custId = document.getElementById('statementCustomerSelect').value;
    const tbody = document.getElementById('statementBody');
    const tfoot = document.getElementById('statementFoot');
    if (!custId) { tbody.innerHTML = '<tr><td colspan="6">Select customer</td></tr>'; tfoot.innerHTML = ''; return; }
    const cust = (appData.customers || []).find(c => c.id === custId);
    if (!cust) return;
    const invoices = (appData.invoices || []).filter(i => i.customerId === custId);
    const payments = (appData.payments || []).filter(p => p.customerId === custId);
    const lines = [];
    const opening = cust.openingBalance || 0;
    if (opening > 0) lines.push({ type: 'opening', invoiceId: null, amount: opening, rec: 0, bal: opening, status: 'Pending' });
    invoices.forEach(inv => {
        const linked = payments.filter(p => p.invoiceId === inv.id);
        const rec = linked.reduce((s, p) => s + (p.amount || 0), 0);
        const bal = (inv.totalAmount || 0) - rec;
        lines.push({ type: 'invoice', invoiceId: inv.id || inv.quoteNo, amount: inv.totalAmount || 0, rec, bal, status: bal <= 0 ? 'Paid' : (rec > 0 ? 'Partial' : 'Pending'), date: inv.docDate });
    });
    let onAccount = payments.filter(p => !p.invoiceId).reduce((s, p) => s + (p.amount || 0), 0);
    if (opening > 0 && onAccount > 0) {
        const apply = Math.min(opening, onAccount);
        const openLine = lines.find(l => l.type === 'opening');
        if (openLine) { openLine.rec += apply; openLine.bal -= apply; openLine.status = openLine.bal <= 0 ? 'Paid' : 'Partial'; }
        onAccount -= apply;
    }
    for (let line of lines) {
        if (line.type !== 'invoice' || line.bal <= 0 || onAccount <= 0) continue;
        const apply = Math.min(line.bal, onAccount);
        line.rec += apply; line.bal -= apply; line.status = line.bal <= 0 ? 'Paid' : 'Partial';
        onAccount -= apply;
    }
    if (onAccount > 0) lines.push({ type: 'credit', invoiceId: null, amount: 0, rec: 0, bal: -onAccount, status: 'Credit' });
    tbody.innerHTML = lines.map(l => {
        const cls = l.bal <= 0 ? 'status-paid' : (l.rec > 0 ? 'status-partial' : 'status-pending');
        return `<tr>
            <td>${l.invoiceId || (l.type==='opening'?'OPB':l.type==='credit'?'Advance':'N/A')}</td>
            <td>${l.date||'-'}</td>
            <td style="text-align:right">${l.amount>0?l.amount.toFixed(2):'-'}</td>
            <td style="text-align:right">${l.rec>0?l.rec.toFixed(2):'-'}</td>
            <td style="text-align:right; font-weight:bold">${l.bal>0?l.bal.toFixed(2):(l.bal<0?Math.abs(l.bal).toFixed(2)+' Cr':'-')}</td>
            <td style="text-align:center"><span class="status-badge ${cls}">${l.status}</span></td>
        </tr>`;
    }).join('');
    const totalInv = lines.reduce((s, l) => s + (l.type !== 'credit' ? l.amount : 0), 0);
    const totalRec = lines.reduce((s, l) => s + l.rec, 0);
    const totalBal = lines.reduce((s, l) => s + l.bal, 0);
    tfoot.innerHTML = `<tr><td colspan="2" style="font-weight:bold;">TOTAL</td><td style="text-align:right">${totalInv.toFixed(2)}</td><td style="text-align:right">${totalRec.toFixed(2)}</td><td style="text-align:right">${totalBal.toFixed(2)}</td><td></td></tr>`;
}

function populatePayInvoices() {
    const custId = document.getElementById('payCustomer').value;
    const sel = document.getElementById('payInvoice');
    sel.innerHTML = '<option value="">Against Opening/Advance</option>';
    if (custId) {
        (appData.invoices || []).filter(i => i.customerId === custId).forEach(i => {
            sel.innerHTML += `<option value="${i.id}">${i.id || i.quoteNo} (₹${(i.totalAmount || 0).toFixed(2)})</option>`;
        });
    }
}

// ===== GLOBAL SEARCH =====
function handleGlobalSearch(query) {
    if (!query.trim()) return;
    const q = query.toLowerCase();
    const cust = (appData.customers || []).find(c => c.name.toLowerCase().includes(q) || (c.company || '').toLowerCase().includes(q));
    if (cust) { navigate('customers'); toast('Found: ' + cust.name); return; }
    const prod = (appData.products || []).find(p => p.name.toLowerCase().includes(q));
    if (prod) { navigate('products'); toast('Found: ' + prod.name); return; }
    const qt = (appData.quotations || []).find(d => (d.id || d.quoteNo || '').toLowerCase().includes(q));
    if (qt) { switchDocType('quotation'); switchCategory(qt._category || CATEGORIES[0].id); loadCurrentFile(); return; }
    const inv = (appData.invoices || []).find(d => (d.id || d.quoteNo || '').toLowerCase().includes(q));
    if (inv) { switchDocType('invoice'); switchCategory(inv._category || CATEGORIES[0].id); loadCurrentFile(); return; }
    toast('No matching record found');
}

function openMonthYearModal() {
    const now = new Date();
    document.getElementById('newDocMonth').value = now.getMonth() + 1;
    document.getElementById('newDocYear').value = now.getFullYear();
    document.getElementById('monthYearModal').classList.add('open');
}

function closeMonthYearModal() { document.getElementById('monthYearModal').classList.remove('open'); }

function createNewFileWithDate() {
    const month = parseInt(document.getElementById('newDocMonth').value);
    const year = parseInt(document.getElementById('newDocYear').value);
    closeMonthYearModal();
    const monthKey = year + '-' + String(month).padStart(2, '0');
    if (getFile(currentCategory, monthKey)) {
        toast('File already exists for ' + getMonthLabel(monthKey), 'error');
        return;
    }
    setFile(currentCategory, monthKey, getDefaultDoc());
    currentMonth = monthKey;
    loadCurrentFile();
    toast('New file created for ' + getMonthLabel(monthKey), 'success');
    navigate(currentDocType);
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', function() {
    const savedTheme = localStorage.getItem('quotePro_theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    const btn = document.querySelector('.btn-setting i.fa-moon, .btn-setting i.fa-sun');
    if (btn) {
        btn.className = savedTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    }

    // Role badge click
    document.querySelectorAll('.role-badge').forEach(badge => {
        badge.addEventListener('click', function() {
            document.querySelectorAll('.role-badge').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            const role = this.dataset.role;
            const pwdField = document.getElementById('passwordField');
            if (role === 'admin') {
                pwdField.classList.add('show');
                pwdField.style.display = 'block';
            } else {
                pwdField.classList.remove('show');
                pwdField.style.display = 'none';
            }
            document.getElementById('loginError').classList.remove('show');
        });
    });

    // Login
    document.getElementById('loginBtn').addEventListener('click', function(e) {
        e.preventDefault();
        handleLogin();
    });
    document.getElementById('loginPassword').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleLogin();
        }
    });

    // Always show login
    showLogin();
    document.querySelectorAll('.role-badge').forEach(b => b.classList.remove('active'));
    const adminBadge = document.querySelector('.role-badge[data-role="admin"]');
    if (adminBadge) adminBadge.classList.add('active');
    document.getElementById('passwordField').classList.add('show');
    document.getElementById('passwordField').style.display = 'block';

    const storedRole = getRole();
    if (storedRole) {
        document.querySelectorAll('.role-badge').forEach(badge => {
            badge.classList.toggle('active', badge.dataset.role === storedRole);
        });
        if (storedRole === 'admin') {
            document.getElementById('passwordField').classList.add('show');
            document.getElementById('passwordField').style.display = 'block';
        } else {
            document.getElementById('passwordField').classList.remove('show');
            document.getElementById('passwordField').style.display = 'none';
        }
    }

    document.getElementById('logoutBtn').addEventListener('click', logout);

    // Bottom nav
    document.querySelectorAll('.bottom-nav button').forEach(btn => {
        btn.addEventListener('click', () => {
            const page = btn.dataset.page;
            if (page === 'dashboard') {
                navigate('dashboard');
            } else if (page === 'quotation' || page === 'invoice') {
                const type = btn.dataset.doctype;
                if (type) {
                    if (currentDocType !== type) switchDocType(type);
                    else navigate(type);
                }
            } else if (btn.id === 'bottomMore') {
                openSidebar();
            }
        });
    });

    document.getElementById('sidebarDashTab').addEventListener('click', function() {
        navigate('dashboard');
        closeSidebar();
    });

    document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
        if (item.id === 'navQuotationTab' || item.id === 'navInvoiceTab') {
            item.addEventListener('click', function() {
                const type = this.id === 'navQuotationTab' ? 'quotation' : 'invoice';
                if (currentDocType !== type) switchDocType(type);
                else navigate(type);
                closeSidebar();
            });
        }
    });

    // Add item buttons
    ['q_', 'i_'].forEach(prefix => {
        const addBtn = document.getElementById(prefix + 'addItemBtn');
        if (addBtn) addBtn.addEventListener('click', addNewItem);
        [prefix + 'newItemDesc', prefix + 'newItemQty', prefix + 'newItemPrice', prefix + 'newItemHsn'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') addNewItem();
            });
        });
        const gstEl = document.getElementById(prefix + 'gstRate');
        if (gstEl) gstEl.addEventListener('input', function() {
            updateTotalsFromDOM();
            scheduleSave();
        });
        document.querySelectorAll('#' + prefix + 'quotationCard input, #' + prefix + 'quotationCard textarea')
            .forEach(el => {
                el.addEventListener('input', scheduleSave);
                el.addEventListener('change', scheduleSave);
            });
    });

    const newFileBtn = document.getElementById('newFileBtn');
    if (newFileBtn) newFileBtn.addEventListener('click', openMonthYearModal);

    document.getElementById('sidebarToggle').addEventListener('click', openSidebar);
    document.getElementById('sidebarClose').addEventListener('click', closeSidebar);
    document.getElementById('sidebarOverlay').addEventListener('click', closeSidebar);

    // Category click delegation
    const categoryList = document.getElementById('categoryList');
    if (categoryList) {
        categoryList.removeEventListener('click', handleCategoryClick);
        categoryList.addEventListener('click', handleCategoryClick);
    }

    populateCustomerDropdowns();

    console.log('🚀 DEFENCE ELV ERP — fully loaded and ready.');
});

// Expose globals
window.saveCurrentFile = saveCurrentFile;
window.deleteCurrentFile = deleteCurrentFile;
window.downloadPDF = downloadPDF;
window.exportData = exportData;
window.importData = importData;
window.createNewFile = createNewFile;
window.switchCategory = switchCategory;
window.switchDocType = switchDocType;
window.toast = toast;
window.navigate = navigate;
window.openPasswordModal = openPasswordModal;
window.closePasswordModal = closePasswordModal;
window.changePassword = changePassword;
window.exportCSV = exportCSV;
window.openSettingsModal = openSettingsModal;
window.closeSettingsModal = closeSettingsModal;
window.toggleDarkMode = toggleDarkMode;
window.closeSidebar = closeSidebar;
window.openSidebar = openSidebar;
window.openCustomerModal = openCustomerModal;
window.closeCustomerModal = closeCustomerModal;
window.saveCustomer = saveCustomer;
window.deleteCustomer = deleteCustomer;
window.openProductModal = openProductModal;
window.closeProductModal = closeProductModal;
window.saveProduct = saveProduct;
window.deleteProduct = deleteProduct;
window.recordPayment = recordPayment;
window.deletePayment = deletePayment;
window.populatePayInvoices = populatePayInvoices;
window.fillDocCustomer = fillDocCustomer;
window.renderLedger = renderLedger;
window.renderStatement = renderStatement;
window.renderCustomers = renderCustomers;
window.renderProducts = renderProducts;
window.renderPayments = renderPayments;
window.handleGlobalSearch = handleGlobalSearch;
window.openMonthYearModal = openMonthYearModal;
window.closeMonthYearModal = closeMonthYearModal;
window.createNewFileWithDate = createNewFileWithDate;
window.CATEGORIES = CATEGORIES;