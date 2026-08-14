// ================================================================
// DEFENCE ELV SYSTEMS — CORE DATA LAYER & SCHEMA (PHASE 1)
// ================================================================

const STORAGE_KEY = 'defence_elv_erp_v1';
const LOGIN_STORAGE_KEY = 'defence_elv_session';

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

function getInitialDataModel() {
  return {
    settings: {
      adminPassword: 'admin123', // Simple password for single-user
      company: {
        name: 'KHAJA FAYAZ AHMED',
        companyName: 'DEFENCE ELV SYSTEMS',
        address: 'Mawin Gold Plaza, Mehdipatnam',
        phone: '8179113882',
        email: 'fayazdefence@gmail.com',
        website: 'www.defencesurveillance.com',
        gstin: ''
      }
    },
    customers: [],
    products: [],
    quotations: [],
    invoices: [],
    payments: [],
    purchases: [],
    expenses: []
  };
}

function generateId(prefix = 'doc') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
}

function generateDocumentNumber(type = 'quotation', dateStr = null) {
  const date = dateStr ? new Date(dateStr) : new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const prefix = type === 'invoice' ? 'INV' : 'QT';
  
  // Base: QT-DD-MM-YYYY
  let base = `${prefix}-${day}-${month}-${year}`;
  let docNo = base;
  
  const store = type === 'invoice' ? appData.invoices : appData.quotations;
  
  // Check if exact base exists
  if (store.some(d => d.documentNo === base)) {
    // Find highest suffix letter (A, B, C...)
    const suffixRegex = new RegExp(`^${base}-([A-Z])$`);
    let maxSuffixCode = 64; // 'A' is 65
    store.forEach(d => {
      const match = d.documentNo.match(suffixRegex);
      if (match) {
        const letter = match[1];
        const code = letter.charCodeAt(0);
        if (code > maxSuffixCode) maxSuffixCode = code;
      }
    });
    const nextLetter = String.fromCharCode(maxSuffixCode + 1);
    docNo = base + '-' + nextLetter;
  }
  
  return docNo;
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const schema = getInitialDataModel();
      for (const key in schema) {
        if (!parsed[key]) parsed[key] = schema[key];
      }
      return parsed;
    }
  } catch (e) {
    console.error('Storage parse error, resetting:', e);
  }
  const fresh = getInitialDataModel();
  saveData(fresh);
  return fresh;
}

function saveData(data = appData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

let appData = loadData();

function getCustomers() { return appData.customers; }
function getCustomer(id) { return appData.customers.find(c => c.id === id) || null; }
function saveCustomer(customer) {
  if (!customer.id) customer.id = generateId('cust');
  const idx = appData.customers.findIndex(c => c.id === customer.id);
  if (idx >= 0) appData.customers[idx] = customer;
  else appData.customers.push(customer);
  saveData();
  return customer;
}
// ─── CUSTOMER CRUD EXTENDED ────────────────────────────────────

function deleteCustomer(id) {
    if (!requireAdmin()) return;
    if (!confirm('Delete this customer? This will not delete linked documents.')) return;
    appData.customers = appData.customers.filter(c => c.id !== id);
    saveData();
    renderCustomers();
    toast('Customer deleted', 'info');
}

function getCustomerById(id) {
    return appData.customers.find(c => c.id === id) || null;
}

function generateCustomerId() {
    const existing = appData.customers;
    const maxId = existing.reduce((max, c) => {
        const num = parseInt(c.id.replace('CUST-', ''), 10);
        return isNaN(num) ? max : Math.max(max, num);
    }, 0);
    const next = maxId + 1;
    return 'CUST-' + String(next).padStart(4, '0');
}

// ─── UI RENDER CUSTOMERS ────────────────────────────────────────

function renderCustomers(filter = '') {
  const tbody = document.getElementById('customersBody');
  if (!tbody) return;
  
  // Keep the search input in sync if it exists
  const searchInput = document.getElementById('customerSearch');
  if (searchInput && filter === '') {
    filter = searchInput.value;
  }
  
  let customers = appData.customers;
  if (filter.trim()) {
    const lower = filter.toLowerCase();
    customers = customers.filter(c => 
      c.name?.toLowerCase().includes(lower) ||
      c.company?.toLowerCase().includes(lower) ||
      c.phone?.includes(filter) ||
      c.email?.toLowerCase().includes(lower) ||
      c.gstin?.toLowerCase().includes(lower)
    );
  }
  
  if (customers.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:2rem; color:var(--gray-400);">No customers found.</td></tr>`;
    return;
  }
  
  tbody.innerHTML = customers.map(c => `
    <tr>
      <td><strong>${c.id}</strong></td>
      <td>${c.name || ''}</td>
      <td>${c.company || ''}</td>
      <td>${c.phone || ''}</td>
      <td>${c.email || ''}</td>
      <td>${c.gstin || ''}</td>
      <td>₹${(c.openingBalance || 0).toFixed(2)}</td>
      <td>
        <div class="action-btns admin-only">
          <button class="edit-customer" data-id="${c.id}" title="Edit"><i class="fas fa-edit"></i></button>
          <button class="delete-customer" data-id="${c.id}" title="Delete"><i class="fas fa-trash"></i></button>
        </div>
      </td>
    </tr>
  `).join('');
  
  tbody.querySelectorAll('.edit-customer').forEach(btn => {
    btn.addEventListener('click', function() {
      const id = this.dataset.id;
      openCustomerModal(id);
    });
  });
  tbody.querySelectorAll('.delete-customer').forEach(btn => {
    btn.addEventListener('click', function() {
      const id = this.dataset.id;
      deleteCustomer(id);
    });
  });
}

function openCustomerModal(customerId = null) {
    if (!requireAdmin()) return;
    const overlay = document.getElementById('customerModalOverlay');
    const form = document.getElementById('customerForm');
    const title = document.getElementById('customerModalTitle');
    const idField = document.getElementById('customerId');
    const nameField = document.getElementById('custName');
    const companyField = document.getElementById('custCompany');
    const phoneField = document.getElementById('custPhone');
    const emailField = document.getElementById('custEmail');
    const addressField = document.getElementById('custAddress');
    const cityField = document.getElementById('custCity');
    const gstField = document.getElementById('custGst');
    const balanceField = document.getElementById('custOpeningBalance');
    const dateField = document.getElementById('custCreatedDate');
    
    form.reset();
    idField.value = '';
    
    if (customerId) {
        const customer = getCustomerById(customerId);
        if (customer) {
            title.innerHTML = `<i class="fas fa-edit" style="color:var(--gold);"></i> Edit Customer`;
            idField.value = customer.id;
            nameField.value = customer.name || '';
            companyField.value = customer.company || '';
            phoneField.value = customer.phone || '';
            emailField.value = customer.email || '';
            addressField.value = customer.address || '';
            cityField.value = customer.city || '';
            gstField.value = customer.gstin || '';
            balanceField.value = customer.openingBalance || 0;
            dateField.value = customer.createdDate || new Date().toISOString().split('T')[0];
        } else {
            toast('Customer not found', 'error');
            return;
        }
    } else {
        title.innerHTML = `<i class="fas fa-user-plus" style="color:var(--gold);"></i> Add Customer`;
        dateField.value = new Date().toISOString().split('T')[0];
        balanceField.value = 0;
    }
    
    overlay.classList.add('open');
}

function closeCustomerModal() {
    document.getElementById('customerModalOverlay').classList.remove('open');
}

function saveCustomerForm(event) {
    event.preventDefault();
    if (!requireAdmin()) return;
    
    const idField = document.getElementById('customerId');
    const name = document.getElementById('custName').value.trim();
    const company = document.getElementById('custCompany').value.trim();
    const phone = document.getElementById('custPhone').value.trim();
    const email = document.getElementById('custEmail').value.trim();
    const address = document.getElementById('custAddress').value.trim();
    const city = document.getElementById('custCity').value.trim();
    const gstin = document.getElementById('custGst').value.trim();
    const openingBalance = parseFloat(document.getElementById('custOpeningBalance').value) || 0;
    const createdDate = document.getElementById('custCreatedDate').value || new Date().toISOString().split('T')[0];
    
    if (!name) {
        toast('Customer name is required', 'error');
        return;
    }
    
    const existingId = idField.value;
    let customer;
    
    if (existingId) {
        customer = getCustomerById(existingId);
        if (!customer) {
            toast('Customer not found', 'error');
            return;
        }
        customer.name = name;
        customer.company = company;
        customer.phone = phone;
        customer.email = email;
        customer.address = address;
        customer.city = city;
        customer.gstin = gstin;
        customer.openingBalance = openingBalance;
        customer.createdDate = createdDate;
        toast('Customer updated', 'success');
    } else {
        customer = {
            id: generateCustomerId(),
            name,
            company,
            phone,
            email,
            address,
            city,
            gstin,
            openingBalance,
            createdDate
        };
        appData.customers.push(customer);
        toast('Customer added', 'success');
    }
    
    saveData();
    closeCustomerModal();
    renderCustomers(document.getElementById('customerSearch')?.value || '');
}

function getQuotations() { return appData.quotations; }
function getQuotation(id) { return appData.quotations.find(q => q.id === id) || null; }
function saveQuotation(quotation) {
  if (!quotation.id) quotation.id = generateId('q');
  if (!quotation.documentNo) quotation.documentNo = generateDocumentNumber('quotation', quotation.quoteDate);
  const idx = appData.quotations.findIndex(q => q.id === quotation.id);
  if (idx >= 0) appData.quotations[idx] = quotation;
  else appData.quotations.push(quotation);
  saveData();
  return quotation;
}
function deleteQuotation(id) {
  appData.quotations = appData.quotations.filter(q => q.id !== id);
  saveData();
}

function getInvoices() { return appData.invoices; }
function getInvoice(id) { return appData.invoices.find(i => i.id === id) || null; }
function saveInvoice(invoice) {
  if (!invoice.id) invoice.id = generateId('inv');
  if (!invoice.documentNo) invoice.documentNo = generateDocumentNumber('invoice', invoice.quoteDate);
  const idx = appData.invoices.findIndex(i => i.id === invoice.id);
  if (idx >= 0) appData.invoices[idx] = invoice;
  else appData.invoices.push(invoice);
  saveData();
  return invoice;
}
function deleteInvoice(id) {
  appData.invoices = appData.invoices.filter(i => i.id !== id);
  saveData();
}

function convertQuotationToInvoice(quotationId) {
  const quotation = getQuotation(quotationId);
  if (!quotation) throw new Error("Quotation not found");

  const existingInvoice = appData.invoices.find(i => i.quotationId === quotationId);
  if (existingInvoice) return existingInvoice;

  const invoice = {
    ...JSON.parse(JSON.stringify(quotation)),
    id: generateId('inv'),
    quotationId: quotation.id,
    documentNo: generateDocumentNumber('invoice'),
    quoteDate: new Date().toISOString().split('T')[0],
    status: 'Unpaid',
    paidAmount: 0
  };

  quotation.status = 'Approved';
  saveQuotation(quotation);
  saveInvoice(invoice);

  return invoice;
}

// ─── APP STATE ─────────────────────────────────────────────────
let currentDocType = 'quotation';
let currentCategory = CATEGORIES[0].id;
let currentDocId = null;
let currentFileData = null;
let sortableInstance = null;
let saveTimeout = null;
let categoryChart = null;

// ─── ROLE MANAGEMENT ──────────────────────────────────────────
// ─── SINGLE-USER ADMIN SYSTEM ─────────────────────────────────

let currentRole = 'admin';
let isLoggedIn = false;

function getRole() {
  return currentRole;
}

function setRole(role = 'admin') {
  currentRole = role;
  
  document.body.classList.remove('viewer', 'admin');
  document.body.classList.add(role);
  
  const roleIndicator = document.getElementById('roleIndicator');
  if (roleIndicator) {
    roleIndicator.textContent = role === 'admin' ? 'Admin' : 'Viewer';
    roleIndicator.className = 'role-indicator' + (role === 'viewer' ? ' viewer-role' : '');
  }
  
  document.querySelectorAll('.admin-only').forEach(el => {
    el.style.display = role === 'admin' ? '' : 'none';
  });
}

function requireAdmin() {
  return currentRole === 'admin';
}

// ─── LOGIN SYSTEM ──────────────────────────────────────────────

function showLogin() {
  const overlay = document.getElementById('loginOverlay');
  if (overlay) {
    overlay.classList.remove('hidden');
    overlay.style.display = 'flex';
  }
  const errorEl = document.getElementById('loginError');
  if (errorEl) errorEl.classList.remove('show');
  const pwdInput = document.getElementById('loginPassword');
  if (pwdInput) pwdInput.value = '';
}

function hideLogin() {
  const overlay = document.getElementById('loginOverlay');
  if (overlay) {
    overlay.classList.add('hidden');
    overlay.style.display = 'none';
  }
}

function handleLogin() {
  const pwdInput = document.getElementById('loginPassword');
  const errorEl = document.getElementById('loginError');
  
  if (!pwdInput) return;
  
  const password = pwdInput.value.trim();
  const savedPassword = appData?.settings?.adminPassword || 'admin123';
  
  if (password === savedPassword) {
    isLoggedIn = true;
    setRole('admin');
    hideLogin();
    localStorage.setItem(LOGIN_STORAGE_KEY, 'logged_in');
    
    // Initialize the app
    renderCategories();
    loadActiveDocument();
    navigate('dashboard');
    updateDashboard();
    
    toast('Welcome back!', 'success');
  } else {
    if (errorEl) {
      errorEl.textContent = 'Incorrect password. Please try again.';
      errorEl.classList.add('show');
    }
    pwdInput.value = '';
    pwdInput.focus();
  }
}

function logout() {
  isLoggedIn = false;
  localStorage.removeItem(LOGIN_STORAGE_KEY);
  setRole('viewer');
  showLogin();
  toast('Logged out successfully', 'info');
}

// ─── DATE & ENTITY HELPERS ────────────────────────────────────
function getMonthLabel(monthKey) {
  if (!monthKey) return '';
  const [y, m] = monthKey.split('-').map(Number);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return months[m - 1] + ' ' + y;
}

function getCategoryLabel(id) {
  const found = CATEGORIES.find(c => c.id === id);
  return found ? found.label : id;
}

// ─── ACTIVE DOCUMENT OPERATIONS ───────────────────────────────
function getActiveStore() {
  return currentDocType === 'invoice' ? getInvoices() : getQuotations();
}

function loadActiveDocument(docId = null) {
  const store = getActiveStore();
  
  // If a specific docId is provided, try to load it
  if (docId) {
    currentFileData = store.find(d => d.id === docId) || null;
  }
  
  // If no specific docId and no file loaded, try the latest document
  if (!currentFileData && store.length > 0) {
    // ✅ Try to find a document matching the current category first
    const categoryDocs = store.filter(d => d.categoryId === currentCategory);
    if (categoryDocs.length > 0) {
      currentFileData = categoryDocs[categoryDocs.length - 1];
    } else {
      currentFileData = store[store.length - 1];
    }
  }
  
  // ✅ ONLY create a new document if the store is completely empty
  // AND no document was loaded
  if (!currentFileData && store.length === 0) {
    currentFileData = {
      id: generateId(currentDocType === 'invoice' ? 'inv' : 'q'),
      documentNo: generateDocumentNumber(currentDocType),
      quoteDate: new Date().toISOString().split('T')[0],
      categoryId: currentCategory,
      items: []
    };
    // Save it immediately so it's persisted
    if (currentDocType === 'invoice') saveInvoice(currentFileData);
    else saveQuotation(currentFileData);
  }
  
  // If we still have no file data (shouldn't happen, but safety)
  if (!currentFileData) {
    // Create a new document only as a last resort
    currentFileData = {
      id: generateId(currentDocType === 'invoice' ? 'inv' : 'q'),
      documentNo: generateDocumentNumber(currentDocType),
      quoteDate: new Date().toISOString().split('T')[0],
      categoryId: currentCategory,
      items: []
    };
    if (currentDocType === 'invoice') saveInvoice(currentFileData);
    else saveQuotation(currentFileData);
  }
  
  currentDocId = currentFileData.id;
  renderFileToUI(currentFileData);
  updatePageTitle();
  initSortable();
  updateDashboard();
}

// ─── DASHBOARD ──────────────────────────────────────────────────
function updateDashboard() {
  const allDocs = [...appData.quotations, ...appData.invoices];
  let totalFiles = allDocs.length;
  let totalItems = 0;
  let totalRevenue = 0;

  const categoryRevenue = {};
  CATEGORIES.forEach(c => categoryRevenue[c.id] = 0);

  allDocs.forEach(doc => {
    const items = doc.items || [];
    totalItems += items.length;
    let docTotal = 0;
    items.forEach(item => {
      const amt = (Number(item.qty) || 0) * (Number(item.unitPrice) || 0);
      docTotal += amt;
      if (doc.categoryId && categoryRevenue[doc.categoryId] !== undefined) {
        categoryRevenue[doc.categoryId] += amt;
      }
    });
    totalRevenue += docTotal;
  });

  const statFilesEl = document.getElementById('statFiles');
  if (statFilesEl) statFilesEl.textContent = totalFiles;

  const statItemsEl = document.getElementById('statItems');
  if (statItemsEl) statItemsEl.textContent = totalItems;

  const statRevenueEl = document.getElementById('statRevenue');
  if (statRevenueEl) statRevenueEl.textContent = '₹' + totalRevenue.toFixed(2);

  const statActiveEl = document.getElementById('statActive');
  if (statActiveEl) {
    const activeCats = new Set(allDocs.map(d => d.categoryId).filter(Boolean));
    statActiveEl.textContent = activeCats.size;
  }

  // Recent Documents List
  const recentDocs = [...allDocs].sort((a, b) => {
    const dateA = a.quoteDate || '';
    const dateB = b.quoteDate || '';
    return dateB.localeCompare(dateA);
  }).slice(0, 5);

  const list = document.getElementById('recentFilesList');
  if (list) {
    if (recentDocs.length === 0) {
      list.innerHTML = '<li style="color:var(--gray-400);font-style:italic;">No documents yet</li>';
    } else {
      list.innerHTML = recentDocs.map(d => {
        const docNo = d.documentNo || 'Draft';
        const catLabel = getCategoryLabel(d.categoryId);
        return `
          <li>
            <span class="file-month">${docNo}</span>
            <span class="file-cat">${catLabel}</span>
          </li>
        `;
      }).join('');
    }
  }

  // Category Revenue Chart (Pie)
  const chartEl = document.getElementById('categoryPieChart');
  if (chartEl) {
    const labels = CATEGORIES.map(c => c.label);
    const data = CATEGORIES.map(c => categoryRevenue[c.id] || 0);
    const ctx = chartEl.getContext('2d');
    if (categoryChart) categoryChart.destroy();
    categoryChart = new Chart(ctx, {
      type: 'pie',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: [
            '#1a5e33', '#2d7a46', '#3a9d5e', '#10b981',
            '#34d399', '#6ee7a0', '#a7f3d0', '#d1fae5'
          ],
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { boxWidth: 12, font: { size: 9 } }
          }
        }
      }
    });
  }

  // Monthly Bar Chart (if canvas exists)
  const barEl = document.getElementById('monthlyBarChart');
  if (barEl) {
    const ctxBar = barEl.getContext('2d');
    // Prepare monthly data from all documents
    const monthMap = {};
    allDocs.forEach(doc => {
      const dateStr = doc.quoteDate || '';
      if (dateStr) {
        const m = dateStr.substring(0, 7); // YYYY-MM
        let total = 0;
        (doc.items || []).forEach(item => {
          total += (Number(item.qty) || 0) * (Number(item.unitPrice) || 0);
        });
        monthMap[m] = (monthMap[m] || 0) + total;
      }
    });
    const sortedMonths = Object.keys(monthMap).sort();
    const barData = sortedMonths.map(m => monthMap[m]);
    const barLabels = sortedMonths.map(m => {
      const [y, mo] = m.split('-');
      return `${mo}/${y.slice(2)}`;
    });
    if (window.monthlyChart) window.monthlyChart.destroy();
    window.monthlyChart = new Chart(ctxBar, {
      type: 'bar',
      data: {
        labels: barLabels,
        datasets: [{
          label: 'Monthly Revenue (₹)',
          data: barData,
          backgroundColor: 'rgba(184, 134, 11, 0.6)',
          borderColor: '#b8860b',
          borderWidth: 1,
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: { beginAtZero: true, ticks: { callback: (val) => '₹' + val } }
        }
      }
    });
  }
}

// ─── RENDER UI ──────────────────────────────────────────────────
function renderCategories() {
  const list = document.getElementById('categoryList');
  if (!list) return;
  list.innerHTML = '';
  CATEGORIES.forEach(cat => {
    const li = document.createElement('li');
    li.dataset.id = cat.id;
    li.className = cat.id === currentCategory ? 'active' : '';
    li.innerHTML = `<i class="fas ${cat.icon}"></i> ${cat.label}`;
    li.addEventListener('click', () => switchCategory(cat.id));
    list.appendChild(li);
  });
}

function renderMonthlyFilesList() {
  const list = document.getElementById('monthlyFilesList');
  if (!list) return;

  // ✅ Update header label
  const headerLabel = document.querySelector('.monthly-files-header span');
  if (headerLabel) {
    const typeLabel = currentDocType === 'quotation' ? 'Quotation' : 'Invoice';
    headerLabel.innerHTML = `<i class="far fa-calendar-alt" style="margin-right:4px;"></i> ${typeLabel} Files`;
  }

  // ✅ Use the correct store based on currentDocType
  const store = getActiveStore(); // returns quotations or invoices
  const filteredDocs = store.filter(d => !currentCategory || d.categoryId === currentCategory);

  if (filteredDocs.length === 0) {
    list.innerHTML = '<li class="no-files-msg">No documents for this category</li>';
    return;
  }

  list.innerHTML = '';
  filteredDocs.forEach(doc => {
    const li = document.createElement('li');
    li.className = doc.id === currentDocId ? 'active-file' : '';
    const label = doc.documentNo || 'Draft';

    li.innerHTML = `
      <span>${label}</span>
      <div class="file-actions admin-only">
        <button title="Delete" data-id="${doc.id}"><i class="fas fa-trash"></i></button>
      </div>
    `;

    li.addEventListener('click', (e) => {
      if (e.target.closest('.file-actions')) return;
      loadActiveDocument(doc.id);
    });

    const delBtn = li.querySelector('.file-actions button');
    if (delBtn) {
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!requireAdmin('delete')) return;
        if (confirm(`Delete document ${label}?`)) {
          if (currentDocType === 'invoice') deleteInvoice(doc.id);
          else deleteQuotation(doc.id);

          if (doc.id === currentDocId) {
            currentFileData = null;
            currentDocId = null;
            loadActiveDocument();
          } else {
            renderMonthlyFilesList();
            updateDashboard();
          }
          toast('Document deleted', 'info');
        }
      });
    }

    list.appendChild(li);
  });
}

function updatePageTitle() {
  const label = currentDocType === 'quotation' ? 'Quotation' : 'Invoice';
  const pageTitleEl = document.getElementById('pageTitle');
  if (pageTitleEl) {
    pageTitleEl.textContent = `${label} — ${getCategoryLabel(currentCategory)}`;
  }

  const catDisplay = document.getElementById('currentCategoryDisplay');
  if (catDisplay) catDisplay.textContent = getCategoryLabel(currentCategory);

  const monthDisplay = document.getElementById('currentMonthDisplay');
  if (monthDisplay) {
    monthDisplay.textContent = currentFileData?.documentNo || 'New Draft';
  }
}

function getFieldElement(fieldKey) {
  const prefix = currentDocType === 'quotation' ? 'q_' : 'i_';
  return document.getElementById(prefix + fieldKey) || document.getElementById(fieldKey);
}

function renderFileToUI(file) {
  if (!file) return;
  const fields = [
    'quoteDate', 'quoteNo', 'poNo', 'projectArea', 'brandName',
    'vendorName', 'vendorCompany', 'vendorAddress', 'vendorPhone', 'vendorEmail', 'vendorWebsite', 'vendorGst',
    'clientName', 'clientCompany', 'clientAddress', 'clientPhone', 'clientGst',
    'projectName', 'projectLocation', 'projectScope', 'projectStartDate', 'projectEndDate', 'projectManager',
    'termsPayment', 'termsWarranty', 'termsSite', 'termsDeclaration'
  ];

  fields.forEach(key => {
    const el = getFieldElement(key);
    if (el) {
      if (key === 'quoteNo' && currentDocType === 'invoice') {
        el.value = file.documentNo || file.invoiceNo || file.quoteNo || '';
      } else if (key === 'quoteNo') {
        el.value = file.documentNo || file.quoteNo || '';
      } else {
        el.value = file[key] || '';
      }
    }
  });

  const gstEl = getFieldElement('gstRate');
  if (gstEl && file.gstRate !== undefined) {
    gstEl.value = file.gstRate;
  }

  renderItems(file.items || []);
  if (typeof updateTotals === 'function') updateTotals();
}

function renderItems(items) {
  const prefix = currentDocType === 'quotation' ? 'q_' : 'i_';
  const tbody = document.getElementById(prefix + 'itemsBody') || document.getElementById('itemsBody');
  if (!tbody) return;

  if (!items || items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:1.5rem;color:var(--gray-400);font-style:italic;">
      <i class="fas fa-plus-circle" style="margin-right:6px;"></i> Add items below</td></tr>`;
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
            <input type="text" class="item-hsn-input hsn-small" value="${escapeHtml(item.hsn || '')}" placeholder="HSN" style="width:70px;font-size:0.7rem;padding:0.15rem 0.3rem;" />
          </div>
        </td>
        <td><input type="number" class="item-qty" value="${item.qty || 1}" min="1" step="1" style="width:60px;text-align:center;" /></td>
        <td><input type="number" class="item-price" value="${item.unitPrice || 0}" min="0" step="0.01" style="width:90px;text-align:center;" /></td>
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
    const hsnInput = row.querySelector('.item-hsn-input');
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
      if (typeof updateTotalsFromDOM === 'function') updateTotalsFromDOM();
      scheduleSave();
    };

    qtyInput.addEventListener('input', updateRow);
    priceInput.addEventListener('input', updateRow);
    descInput.addEventListener('input', scheduleSave);
    if (hsnInput) hsnInput.addEventListener('input', scheduleSave);

    if (removeBtn) {
      removeBtn.addEventListener('click', function() {
        if (!requireAdmin('remove')) return;
        const tr = this.closest('tr');
        const idx = parseInt(tr.dataset.index);
        if (typeof removeItem === 'function') removeItem(idx);
      });
    }
    if (dupBtn) {
      dupBtn.addEventListener('click', function() {
        if (!requireAdmin('duplicate')) return;
        const tr = this.closest('tr');
        const idx = parseInt(tr.dataset.index);
        if (typeof duplicateItem === 'function') duplicateItem(idx);
      });
    }
  });

  if (typeof initSortable === 'function') initSortable();
  if (typeof updateDashboard === 'function') updateDashboard();
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── COLLECT DATA ────────────────────────────────────────────
function collectItemsFromUI() {
  const prefix = currentDocType === 'quotation' ? 'q_' : 'i_';
  const tbody = document.getElementById(prefix + 'itemsBody') || document.getElementById('itemsBody');
  const items = [];
  if (!tbody) return items;

  const rows = tbody.querySelectorAll('tr');
  if (rows.length === 0 || (rows.length === 1 && rows[0].querySelector('td[colspan]'))) return items;

  rows.forEach(row => {
    const descInput = row.querySelector('.item-desc-input');
    const hsnInput = row.querySelector('.item-hsn-input');
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
  const fields = [
    'quoteDate', 'quoteNo', 'poNo', 'projectArea', 'brandName',
    'vendorName', 'vendorCompany', 'vendorAddress', 'vendorPhone', 'vendorEmail', 'vendorWebsite', 'vendorGst',
    'clientName', 'clientCompany', 'clientAddress', 'clientPhone', 'clientGst',
    'projectName', 'projectLocation', 'projectScope', 'projectStartDate', 'projectEndDate', 'projectManager',
    'termsPayment', 'termsWarranty', 'termsSite', 'termsDeclaration'
  ];

  fields.forEach(key => {
    const el = getFieldElement(key);
    if (el) currentFileData[key] = el.value;
  });

  currentFileData.categoryId = currentCategory;
  const gstEl = getFieldElement('gstRate');
  if (gstEl) currentFileData.gstRate = parseFloat(gstEl.value) || 0;
}

// ─── SAVE ──────────────────────────────────────────────────────
function scheduleSave() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    collectItemsAndSave();
  }, 300);
}

function collectItemsAndSave() {
  if (currentRole !== 'admin') return;
  if (!currentFileData) {
    currentFileData = {
      id: generateId(currentDocType === 'invoice' ? 'inv' : 'q'),
      documentNo: generateDocumentNumber(currentDocType),
      quoteDate: new Date().toISOString().split('T')[0],
      categoryId: currentCategory,
      items: []
    };
  }

  currentFileData.items = collectItemsFromUI();
  collectOtherFields();

  if (currentDocType === 'invoice') {
    saveInvoice(currentFileData);
  } else {
    saveQuotation(currentFileData);
  }

  currentDocId = currentFileData.id;
  renderMonthlyFilesList();
  updateDashboard();
}

// ─── UPDATE TOTALS ─────────────────────────────────────────────
function getGSTRate() {
  const prefix = currentDocType === 'quotation' ? 'q_' : 'i_';
  const el = document.getElementById(prefix + 'gstRate') || document.getElementById('gstRate');
  return el ? parseFloat(el.value) || 0 : 0;
}

function updateTotalsFromDOM() {
  const prefix = currentDocType === 'quotation' ? 'q_' : 'i_';
  let subtotal = 0;
  const tbody = document.getElementById(prefix + 'itemsBody') || document.getElementById('itemsBody');
  if (tbody) {
    const rows = tbody.querySelectorAll('tr');
    rows.forEach(row => {
      const qtyInput = row.querySelector('.item-qty');
      const priceInput = row.querySelector('.item-price');
      if (qtyInput && priceInput) {
        const qty = parseFloat(qtyInput.value) || 0;
        const price = parseFloat(priceInput.value) || 0;
        subtotal += qty * price;
      }
    });
  }
  const gstRate = getGSTRate();
  const gst = subtotal * (gstRate / 100);
  const total = subtotal + gst;

  const subEl = document.getElementById(prefix + 'subtotalDisplay') || document.getElementById('subtotalDisplay');
  if (subEl) subEl.textContent = '₹' + subtotal.toFixed(2);

  const gstEl = document.getElementById(prefix + 'gstDisplay') || document.getElementById('gstDisplay');
  if (gstEl) gstEl.textContent = '₹' + gst.toFixed(2);

  const totEl = document.getElementById(prefix + 'totalDisplay') || document.getElementById('totalDisplay');
  if (totEl) totEl.textContent = '₹' + total.toFixed(2);

  const wordsEl = document.getElementById(prefix + 'amountWords') || document.getElementById('amountWords');
  if (wordsEl) wordsEl.textContent = numberToWords(total);
}

function updateTotals() {
  const prefix = currentDocType === 'quotation' ? 'q_' : 'i_';
  const items = currentFileData?.items || [];
  let subtotal = 0;
  items.forEach(item => { subtotal += (Number(item.qty) || 0) * (Number(item.unitPrice) || 0); });
  const gstRate = getGSTRate();
  const gst = subtotal * (gstRate / 100);
  const total = subtotal + gst;

  const subEl = document.getElementById(prefix + 'subtotalDisplay') || document.getElementById('subtotalDisplay');
  if (subEl) subEl.textContent = '₹' + subtotal.toFixed(2);

  const gstEl = document.getElementById(prefix + 'gstDisplay') || document.getElementById('gstDisplay');
  if (gstEl) gstEl.textContent = '₹' + gst.toFixed(2);

  const totEl = document.getElementById(prefix + 'totalDisplay') || document.getElementById('totalDisplay');
  if (totEl) totEl.textContent = '₹' + total.toFixed(2);

  const wordsEl = document.getElementById(prefix + 'amountWords') || document.getElementById('amountWords');
  if (wordsEl) wordsEl.textContent = numberToWords(total);
}

function numberToWords(num) {
  if (num === 0) return 'Zero';
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
    'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const numStr = num.toFixed(2);
  const parts = numStr.split('.');
  const rupees = parseInt(parts[0]);
  const paise = parseInt(parts[1]);

  function convert(n) {
    if (n === 0) return '';
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + ones[n % 10] : '');
    if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' ' + convert(n % 100) : '');
    if (n < 100000) return convert(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 !== 0 ? ' ' + convert(n % 1000) : '');
    if (n < 10000000) return convert(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 !== 0 ? ' ' + convert(n % 100000) : '');
    return convert(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 !== 0 ? ' ' + convert(n % 10000000) : '');
  }

  let result = convert(rupees);
  if (paise > 0) result += ' and ' + convert(paise) + ' Paise';
  return result + ' Only';
}

// ─── ITEM OPERATIONS ──────────────────────────────────────────
function removeItem(idx) {
  if (!requireAdmin('remove')) return;
  if (!currentFileData) return;
  const items = currentFileData.items || [];
  if (idx >= 0 && idx < items.length) {
    items.splice(idx, 1);
    currentFileData.items = items;
    collectItemsAndSave();
    renderFileToUI(currentFileData);
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
    collectItemsAndSave();
    renderFileToUI(currentFileData);
    toast('Item duplicated', 'success');
  }
}

function addNewItem() {
  if (!requireAdmin('add')) return;
  const prefix = currentDocType === 'quotation' ? 'q_' : 'i_';
  const descEl = document.getElementById(prefix + 'newItemDesc') || document.getElementById('newItemDesc');
  const hsnEl = document.getElementById(prefix + 'newItemHsn') || document.getElementById('newItemHsn');
  const qtyEl = document.getElementById(prefix + 'newItemQty') || document.getElementById('newItemQty');
  const priceEl = document.getElementById(prefix + 'newItemPrice') || document.getElementById('newItemPrice');

  const desc = descEl ? descEl.value.trim() : '';
  const hsn = hsnEl ? hsnEl.value.trim() : '';
  const qty = qtyEl ? parseFloat(qtyEl.value) || 1 : 1;
  const price = priceEl ? parseFloat(priceEl.value) || 0 : 0;

  if (!desc && qty === 0 && price === 0) {
    toast('Please enter item description', 'error');
    return;
  }

  if (!currentFileData) {
    currentFileData = {
      id: generateId(currentDocType === 'invoice' ? 'inv' : 'q'),
      documentNo: generateDocumentNumber(currentDocType),
      quoteDate: new Date().toISOString().split('T')[0],
      categoryId: currentCategory,
      items: []
    };
  }

  if (!currentFileData.items) currentFileData.items = [];
  currentFileData.items.push({ description: desc || 'Item', hsn, qty, unitPrice: price });

  collectItemsAndSave();
  renderFileToUI(currentFileData);

  if (descEl) descEl.value = '';
  if (hsnEl) hsnEl.value = '';
  if (qtyEl) qtyEl.value = '1';
  if (priceEl) priceEl.value = '0';
  toast('Item added', 'success');
}

// ─── SORTABLE ──────────────────────────────────────────────────
function initSortable() {
  const prefix = currentDocType === 'quotation' ? 'q_' : 'i_';
  const tbody = document.getElementById(prefix + 'itemsBody') || document.getElementById('itemsBody');
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
        collectItemsAndSave();
        renderItems(items);
        updateTotals();
        toast('Items reordered', 'info');
      }
    }
  });
}

// ─── NAVIGATION & DOCUMENT SWITCHING ─────────────────────────
function switchCategory(catId) {
  if (catId === currentCategory) return;
  
  // Save current file first
  collectItemsAndSave();
  
  // Update current category
  currentCategory = catId;

  // Update category highlight in sidebar
  document.querySelectorAll('.sidebar-categories li').forEach(el => {
    el.classList.toggle('active', el.dataset.id === catId);
  });

  // Load the last document of the new category, or create a new one
  const store = getActiveStore();
  const categoryDocs = store.filter(d => d.categoryId === catId);
  if (categoryDocs.length > 0) {
    loadActiveDocument(categoryDocs[categoryDocs.length - 1].id);
  } else {
    createNewFile(); // this will create a file for the new category
  }

  // ✅ CRITICAL: Refresh file list immediately
  renderMonthlyFilesList();
  updatePageTitle();
  
  closeSidebar();
  toast('Switched to ' + getCategoryLabel(catId), 'info');
  
  // Navigate to doc page (ensures sidebar view is correct)
  navigate('docpage');
}

function switchDocType(type) {
  if (type === currentDocType) return;
  
  // Save current file first
  collectItemsAndSave();
  
  // Update doc type
  currentDocType = type;

  // Load the last document of the current category, or create a new one
  const store = getActiveStore();
  const categoryDocs = store.filter(d => d.categoryId === currentCategory);
  if (categoryDocs.length > 0) {
    loadActiveDocument(categoryDocs[categoryDocs.length - 1].id);
  } else {
    loadActiveDocument(); // this creates a new draft
  }

  // ✅ Force navigation to the document page
  navigate('docpage');
  
  // ✅ Extra safety: ensure the page is shown (if navigate didn't work)
  const targetPage = document.getElementById('page-' + currentDocType);
  if (targetPage) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    targetPage.classList.add('active');
  }
  
  // Refresh UI
  renderMonthlyFilesList();
  updatePageTitle();
  
  // ✅ Show a toast for feedback
  toast('Switched to ' + (type === 'quotation' ? 'Quotation' : 'Invoice'), 'info');
}

function createNewFile(selectedDate = null, docType = null, categoryId = null) {
  if (!requireAdmin('create file')) return;
  collectItemsAndSave();

  // Determine document type
  const type = docType || currentDocType || 'quotation';
  // Determine category
  const cat = categoryId || currentCategory || CATEGORIES[0].id;

  // Determine date
  let dateObj = selectedDate ? new Date(selectedDate) : new Date();
  if (isNaN(dateObj.getTime())) dateObj = new Date();
  const dateStr = dateObj.toISOString().split('T')[0];

  // Update global state (so the UI reflects the new type/category)
  currentDocType = type;
  currentCategory = cat;

  currentFileData = {
    id: generateId(type === 'invoice' ? 'inv' : 'q'),
    documentNo: generateDocumentNumber(type, dateStr),
    quoteDate: dateStr,
    categoryId: cat,
    items: []
  };

  currentDocId = currentFileData.id;
  if (type === 'invoice') saveInvoice(currentFileData);
  else saveQuotation(currentFileData);

  // Refresh UI
  renderFileToUI(currentFileData);
  renderMonthlyFilesList();
  updatePageTitle();
  updateDashboard();
  toast('New document created: ' + currentFileData.documentNo, 'success');
  
  // Navigate to the correct doc page
  navigate('docpage');
}

// ─── NEW FILE DATE PICKER ──────────────────────────────────────

// ─── NEW FILE DATE PICKER ──────────────────────────────────────

function openNewFileModal(defaultType = null, defaultCategory = null) {
    // Populate category dropdown dynamically
    const catSelect = document.getElementById('newFileCategory');
    if (catSelect) {
        catSelect.innerHTML = '';
        CATEGORIES.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat.id;
            opt.textContent = cat.label;
            catSelect.appendChild(opt);
        });
        // Set default category
        if (defaultCategory && CATEGORIES.find(c => c.id === defaultCategory)) {
            catSelect.value = defaultCategory;
        } else if (currentCategory) {
            catSelect.value = currentCategory;
        }
    }

    // Set default document type
    const typeSelect = document.getElementById('newFileType');
    if (typeSelect) {
        if (defaultType && (defaultType === 'quotation' || defaultType === 'invoice')) {
            typeSelect.value = defaultType;
        } else {
            typeSelect.value = currentDocType || 'quotation';
        }
    }

    // Set default date to today
    const today = new Date().toISOString().split('T')[0];
    const dateInput = document.getElementById('newFileDate');
    if (dateInput) dateInput.value = today;

    // Show modal
    document.getElementById('newFileModalOverlay').classList.add('open');
}

function closeNewFileModal() {
    document.getElementById('newFileModalOverlay').classList.remove('open');
}

function confirmNewFile() {
    const typeSelect = document.getElementById('newFileType');
    const catSelect = document.getElementById('newFileCategory');
    const dateInput = document.getElementById('newFileDate');

    const docType = typeSelect ? typeSelect.value : 'quotation';
    const categoryId = catSelect ? catSelect.value : CATEGORIES[0].id;
    const selectedDate = dateInput ? dateInput.value : null;

    if (!selectedDate) {
        toast('Please select a date', 'error');
        return;
    }

    closeNewFileModal();
    // Create the file with the selected parameters
    createNewFile(selectedDate, docType, categoryId);
}

function createNewFileFromDashboard() {
  // Open the modal with defaults (quotation, first category)
  openNewFileModal('quotation', CATEGORIES[0].id);
}

function saveCurrentFile() {
  if (!requireAdmin('save')) return;
  collectItemsAndSave();
  toast('File saved successfully', 'success');
}

function deleteCurrentFile() {
  if (!requireAdmin('delete')) return;
  if (!currentDocId) return;
  if (!confirm(`Delete active ${currentDocType}?`)) return;

  if (currentDocType === 'invoice') deleteInvoice(currentDocId);
  else deleteQuotation(currentDocId);

  currentFileData = null;
  currentDocId = null;
  loadActiveDocument();
  toast('Document deleted', 'info');
}

function printQuotation() {
  collectItemsAndSave();
  window.print();
}

// ─── PDF ──────────────────────────────────────────────────────
function downloadPDF() {
  collectItemsAndSave();
  const prefix = currentDocType === 'quotation' ? 'q_' : 'i_';
  const element = document.getElementById(prefix + 'quotationCard') ||
                  document.getElementById('quotationCard') ||
                  document.getElementById('invoiceCard') ||
                  document.querySelector('.doc-card');

  if (!element) {
    toast('No document available to export', 'error');
    return;
  }

  const opt = {
    margin: 0.4,
    filename: `${currentDocType}_${currentFileData?.documentNo || 'Doc'}.pdf`,
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

// ─── EXPORT / IMPORT ──────────────────────────────────────────
function exportData() {
  if (!requireAdmin('export')) return;
  const dataStr = JSON.stringify(appData, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `QuotePro_Backup_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Data exported', 'success');
}

function importData(event) {
  if (!requireAdmin('import')) return;
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const imported = JSON.parse(e.target.result);
      if (imported.quotations && imported.invoices) {
        appData = imported;
        saveData(appData);
        loadActiveDocument();
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
}
function exportCSV() {
  if (!requireAdmin('export')) return;
  // Basic CSV export of all items from quotations and invoices
  let csv = 'Document No,Type,Customer,Description,HSN,Qty,Unit Price,Total,GST Rate,GST Amount,Grand Total\n';
  const allDocs = [...appData.quotations, ...appData.invoices];
  allDocs.forEach(doc => {
    const type = doc.quotationId ? 'Invoice' : 'Quotation';
    const customer = doc.clientName || doc.clientCompany || '';
    const items = doc.items || [];
    items.forEach(item => {
      const qty = Number(item.qty) || 0;
      const price = Number(item.unitPrice) || 0;
      const total = qty * price;
      const gstRate = doc.gstRate || 0;
      const gst = total * (gstRate / 100);
      const grand = total + gst;
      csv += `${doc.documentNo || ''},${type},${customer},${item.description || ''},${item.hsn || ''},${qty},${price.toFixed(2)},${total.toFixed(2)},${gstRate},${gst.toFixed(2)},${grand.toFixed(2)}\n`;
    });
  });
  // If no items, add at least the doc header
  if (allDocs.length === 0) {
    csv += 'No documents found';
  }
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `DEFENCE_ELV_Export_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast('CSV exported', 'success');
}

// ─── TOAST ─────────────────────────────────────────────────────
function toast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const el = document.createElement('div');
  const icon = type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle';
  el.className = `toast toast-${type}`;
  el.innerHTML = `<i class="fas ${icon}"></i> ${message}`;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateX(20px)';
    setTimeout(() => el.remove(), 300);
  }, 3000);
}

// ─── SIDEBAR TOGGLE ──────────────────────────────────────────
function openSidebar() {
  const sb = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (sb) sb.classList.add('open');
  if (overlay) overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeSidebar() {
  const sb = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (sb) sb.classList.remove('open');
  if (overlay) overlay.classList.remove('open');
  document.body.style.overflow = '';
}

// ─── DARK MODE ────────────────────────────────────────────────
function toggleDarkMode() {
  const current = document.documentElement.getAttribute('data-theme');
  const newTheme = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('quotePro_theme', newTheme);
  toast(`Switched to ${newTheme} mode`, 'info');
}

// ─── NAVIGATION ──────────────────────────────────────────────
function navigate(pageId) {
  // Hide all pages
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

  // Show the target page
  let targetPage;
  if (pageId === 'dashboard') {
    targetPage = document.getElementById('page-dashboard');
  } else if (pageId === 'customers') {
    targetPage = document.getElementById('page-customers');
    if (targetPage) {
      renderCustomers(document.getElementById('customerSearch')?.value || '');
    }
  } else {
    targetPage = document.getElementById('page-' + currentDocType);
  }

  if (targetPage) targetPage.classList.add('active');

  // ─── SIDEBAR VIEW TOGGLE ───────────────────────────────────────
  // Any of these pageIds should show the category view in sidebar
  const isDocPage = (pageId === 'quotation' || pageId === 'invoice' || pageId === 'docpage');
  
  if (isDocPage) {
    // Show category view, hide top-level
    const topLevel = document.getElementById('sidebarTopLevel');
    const categoryView = document.getElementById('sidebarCategoryView');
    if (topLevel) topLevel.style.display = 'none';
    if (categoryView) categoryView.style.display = '';
    
    // Update doc type label
    const docTypeLabel = document.getElementById('docTypeLabel');
    if (docTypeLabel) {
      docTypeLabel.textContent = currentDocType === 'quotation' ? 'Quotation' : 'Invoice';
    }
    
    // ✅ CRITICAL: Refresh file list and category highlights
    renderMonthlyFilesList();
    
    // Highlight the active category
    document.querySelectorAll('.sidebar-categories li').forEach(li => {
      li.classList.toggle('active', li.dataset.id === currentCategory);
    });
    
    updatePageTitle();
  } else {
    // Show top-level, hide category view
    const topLevel = document.getElementById('sidebarTopLevel');
    const categoryView = document.getElementById('sidebarCategoryView');
    if (topLevel) topLevel.style.display = '';
    if (categoryView) categoryView.style.display = 'none';
  }

 // ─── Update sidebar highlights ────────────────────────────────
document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
  item.classList.remove('active');
});

if (pageId === 'dashboard') {
  const dashTab = document.getElementById('sidebarDashTab');
  if (dashTab) dashTab.classList.add('active');
} else if (pageId === 'customers') {
  const custTab = document.getElementById('sidebarCustomersTab');
  if (custTab) custTab.classList.add('active');
} else if (pageId === 'quotation' || pageId === 'invoice' || pageId === 'docpage') {
  // Highlight the tab matching currentDocType
  const tabId = currentDocType === 'quotation' ? 'sidebarQuotationsTab' : 'sidebarInvoicesTab';
  const tab = document.getElementById(tabId);
  if (tab) tab.classList.add('active');
}

  // Update page title
  const pageTitleEl = document.getElementById('pageTitle');
  if (pageTitleEl) {
    if (pageId === 'dashboard') {
      pageTitleEl.textContent = 'Dashboard';
    } else if (pageId === 'customers') {
      pageTitleEl.textContent = 'Customers';
    } else {
      pageTitleEl.textContent = `${currentDocType === 'quotation' ? 'Quotation' : 'Invoice'} — ${getCategoryLabel(currentCategory)}`;
    }
  }

  // Update dashboard if needed
  if (pageId === 'dashboard' && typeof updateDashboard === 'function') {
    updateDashboard();
  }

  closeSidebar();
}

function exitDocView() {
  // Navigate to Dashboard, which will show top-level and hide category view
  navigate('dashboard');
}

// ─── LOGOUT ──────────────────────────────────────────────────
function logout() {
  localStorage.removeItem('quotePro_role');
  currentRole = 'viewer';
  document.body.classList.remove('admin', 'viewer');
  showLogin();
  toast('Logged out', 'info');
}

// ─── INIT ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  // Load theme
  const savedTheme = localStorage.getItem('quotePro_theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);

  // ─── LOGIN SETUP ──────────────────────────────────────────────
  
  // Login button
  const loginBtn = document.getElementById('loginBtn');
  if (loginBtn) {
    loginBtn.addEventListener('click', handleLogin);
  }

  // Password field Enter key
  const loginPassword = document.getElementById('loginPassword');
  if (loginPassword) {
    loginPassword.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleLogin();
      }
    });
    // Auto-focus on load
    setTimeout(() => loginPassword.focus(), 300);
  }

  // Logout button
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', logout);

  // ─── CHECK SESSION ─────────────────────────────────────────────
  
  const sessionExists = localStorage.getItem(LOGIN_STORAGE_KEY) === 'logged_in';
  
  if (sessionExists) {
    // Auto-login
    isLoggedIn = true;
    setRole('admin');
    hideLogin();
    
    renderCategories();
    loadActiveDocument();
    navigate('dashboard');
    updateDashboard();
    
    console.log('✅ Session restored');
  } else {
    // Show login
    showLogin();
    console.log('🔐 Login required');
  }

  // ─── APP SETUP ─────────────────────────────────────────────────
  
  // Add Item buttons
  ['q_', 'i_'].forEach(prefix => {
    const addBtn = document.getElementById(prefix + 'addItemBtn');
    if (addBtn) addBtn.addEventListener('click', addNewItem);

    const gstInput = document.getElementById(prefix + 'gstRate');
    if (gstInput) {
      gstInput.addEventListener('input', function() {
        updateTotalsFromDOM();
        scheduleSave();
      });
    }

    const card = document.getElementById(prefix + 'quotationCard') || document.getElementById('invoiceCard');
    if (card) {
      card.querySelectorAll('input, textarea').forEach(el => {
        el.addEventListener('input', scheduleSave);
        el.addEventListener('change', scheduleSave);
      });
    }
  });

  // New File button
const newFileBtn = document.getElementById('newFileBtn');
if (newFileBtn) {
  newFileBtn.addEventListener('click', function() {
    openNewFileModal(currentDocType, currentCategory);
  });
}

  // Sidebar toggle
  const sbToggle = document.getElementById('sidebarToggle');
  if (sbToggle) sbToggle.addEventListener('click', openSidebar);

  const sbClose = document.getElementById('sidebarClose');
  if (sbClose) sbClose.addEventListener('click', closeSidebar);

  const sbOverlay = document.getElementById('sidebarOverlay');
  if (sbOverlay) sbOverlay.addEventListener('click', closeSidebar);

  // ─── CUSTOMERS ──────────────────────────────────────────────────
  const searchInput = document.getElementById('customerSearch');
  if (searchInput) {
    searchInput.addEventListener('input', function() {
      renderCustomers(this.value);
    });
  }
  
  const addBtn = document.getElementById('addCustomerBtn');
  if (addBtn) {
    addBtn.addEventListener('click', function() {
      openCustomerModal();
    });
  }
  
  // Override the form submit (since we use onsubmit="saveCustomerForm(event)" in HTML)
  const custForm = document.getElementById('customerForm');
  if (custForm) {
    custForm.addEventListener('submit', saveCustomerForm);
  }
  
  // Close modal on overlay click
  const modalOverlay = document.getElementById('customerModalOverlay');
  if (modalOverlay) {
    modalOverlay.addEventListener('click', function(e) {
      if (e.target === this) closeCustomerModal();
    });
  }

  // Ctrl+S save shortcut
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveCurrentFile();
    }
  });

  console.log('🚀 Defence ELV Systems initialized');
 // Confirm new file button
const confirmBtn = document.getElementById('confirmNewFileBtn');
if (confirmBtn) confirmBtn.addEventListener('click', confirmNewFile);

// Close modal on overlay click
const newFileModal = document.getElementById('newFileModalOverlay');
if (newFileModal) {
  newFileModal.addEventListener('click', function(e) {
    if (e.target === this) closeNewFileModal();
  });
}
});

// Expose global functions
window.saveCurrentFile = saveCurrentFile;
window.deleteCurrentFile = deleteCurrentFile;
window.printQuotation = printQuotation;
window.downloadPDF = downloadPDF;
window.exportData = exportData;
window.importData = importData;
window.createNewFile = createNewFile;
window.switchCategory = switchCategory;
window.switchDocType = switchDocType;
window.convertActiveQuotationToInvoice = function() {
  if (!currentDocId || currentDocType !== 'quotation') {
    toast('Select a valid quotation first', 'error');
    return;
  }
  try {
    const invoice = convertQuotationToInvoice(currentDocId);
    switchDocType('invoice');
    loadActiveDocument(invoice.id);
    toast('Converted to Invoice: ' + invoice.documentNo, 'success');
  } catch (err) {
    toast(err.message || 'Conversion failed', 'error');
  }
};
