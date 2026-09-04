// ================================================================
// DEFENCE ELV SYSTEMS — CORE DATA LAYER & SCHEMA
// ================================================================

const STORAGE_KEY = 'defence_elv_erp_v1';
const LOGIN_STORAGE_KEY = 'defence_elv_session';
const SCHEMA_VERSION = 2;

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

const PAYMENT_METHODS = ['Cash', 'Bank Transfer', 'UPI', 'Cheque', 'Other'];

function getInitialDataModel() {
  return {
    schemaVersion: SCHEMA_VERSION,
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

function generatePaymentNumber(dateStr = null) {
  const date = dateStr ? parseLocalDate(dateStr) : new Date();
  if (Number.isNaN(date.getTime())) throw new Error('Invalid payment date.');
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const base = `PAY-${day}-${month}-${year}-`;
  let highestNumber = 0;
  (appData.payments || []).forEach(p => {
    if (!p || typeof p.paymentNo !== 'string') return;
    const match = p.paymentNo.match(new RegExp(`^${base}(\\d+)$`));
    if (match) {
      const number = parseInt(match[1], 10);
      if (number > highestNumber) highestNumber = number;
    }
  });
  return `${base}${highestNumber + 1}`;
}

// Parses a 'YYYY-MM-DD' date string as a LOCAL date (avoids the UTC-midnight
// shift that `new Date('YYYY-MM-DD')` causes, which can silently roll the
// date back a day in negative-UTC-offset timezones).
function parseLocalDate(dateStr) {
  if (!dateStr) return new Date();
  if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(dateStr);
}

// Formats a Date object as 'YYYY-MM-DD' using LOCAL time components
// (avoids the UTC-shift bug that .toISOString().split('T')[0] causes).
function formatLocalDate(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function generateDocumentNumber(type = 'quotation', dateStr = null) {
  const date = dateStr ? parseLocalDate(dateStr) : new Date();

  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid document date.');
  }

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();

  const prefix = type === 'invoice' ? 'INV' : 'QT';

  const base = `${prefix}-${day}-${month}-${year}-`;

  const store = type === 'invoice'
    ? appData.invoices
    : appData.quotations;

  let highestNumber = 0;

  store.forEach(doc => {
    if (!doc || typeof doc.documentNo !== 'string') return;

    const match = doc.documentNo.match(
      new RegExp(`^${base}(\\d+)$`)
    );

    if (match) {
      const number = parseInt(match[1], 10);

      if (number > highestNumber) {
        highestNumber = number;
      }
    }
  });

  return `${base}${highestNumber + 1}`;
}

// ─── SCHEMA MIGRATION ──────────────────────────────────────────
// Never destructively replaces existing data. Only fills gaps,
// backfills new fields with safe defaults, and fixes structural
// issues (e.g. missing arrays). A timestamped backup of the raw
// pre-migration data is kept in localStorage under a separate key.
function migrateData(parsed) {
  const schema = getInitialDataModel();

  // Backfill any missing top-level keys (arrays/objects) without
  // touching existing data.
  for (const key in schema) {
    if (parsed[key] === undefined || parsed[key] === null) {
      parsed[key] = schema[key];
    }
  }
  if (!Array.isArray(parsed.customers)) parsed.customers = [];
  if (!Array.isArray(parsed.products)) parsed.products = [];
  if (!Array.isArray(parsed.quotations)) parsed.quotations = [];
  if (!Array.isArray(parsed.invoices)) parsed.invoices = [];
  if (!Array.isArray(parsed.payments)) parsed.payments = [];
  if (!Array.isArray(parsed.purchases)) parsed.purchases = [];
  if (!Array.isArray(parsed.expenses)) parsed.expenses = [];
  if (!parsed.settings) parsed.settings = schema.settings;
  if (!parsed.settings.company) parsed.settings.company = schema.settings.company;
  if (!parsed.settings.adminPassword) parsed.settings.adminPassword = 'admin123';

  const fromVersion = parsed.schemaVersion || 1;

  if (fromVersion < 2) {
    // v1 -> v2: introduce customerId + customer snapshot on documents,
    // quotation status, invoice payment fields, and stable customer IDs.
    // Existing document IDs and document numbers are left untouched.

    // Ensure every customer has a stable CUST-#### id.
    parsed.customers.forEach(c => {
      if (!c.id) c.id = generateId('cust');
      if (c.active === undefined) c.active = true;
      if (c.openingBalance === undefined) c.openingBalance = 0;
    });

    const findCustomerByNameCompany = (name, company) => {
      if (!name && !company) return null;
      return parsed.customers.find(c =>
        (c.name || '').trim().toLowerCase() === (name || '').trim().toLowerCase() &&
        (c.company || '').trim().toLowerCase() === (company || '').trim().toLowerCase()
      ) || null;
    };

    const backfillDoc = (doc, type) => {
      if (!doc.items) doc.items = [];
      if (doc.gstRate === undefined) doc.gstRate = 18;
      if (!doc.categoryId) doc.categoryId = CATEGORIES[0].id;

      // Link to a customer if we can find a matching one by name/company;
      // otherwise leave customerId null (legacy "unlinked" documents remain
      // visible and functional but are not attributed to a Customer Master
      // record). We NEVER guess-create fake customers here.
      if (!doc.customerId) {
        const match = findCustomerByNameCompany(doc.clientName, doc.clientCompany);
        doc.customerId = match ? match.id : null;
      }

      // Historical snapshot of client info as displayed on the document,
      // so future Customer Master edits never alter old documents.
      if (!doc.customerSnapshot) {
        doc.customerSnapshot = {
          name: doc.clientName || '',
          company: doc.clientCompany || '',
          address: doc.clientAddress || '',
          phone: doc.clientPhone || '',
          gstin: doc.clientGst || ''
        };
      }

      if (type === 'quotation') {
        if (!doc.status) doc.status = 'Pending';
      } else {
        if (!doc.status) doc.status = 'Unpaid';
        if (doc.paidAmount === undefined) doc.paidAmount = 0;
        if (!doc.dueDate) doc.dueDate = doc.quoteDate || '';
      }
      return doc;
    };

    parsed.quotations.forEach(q => backfillDoc(q, 'quotation'));
    parsed.invoices.forEach(inv => backfillDoc(inv, 'invoice'));

    parsed.payments.forEach(p => {
      if (!p.id) p.id = generateId('pay');
      if (p.amount === undefined) p.amount = 0;
      if (!p.method) p.method = 'Cash';
    });
  }

  parsed.schemaVersion = SCHEMA_VERSION;
  return parsed;
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Backup pre-migration snapshot (kept, never overwritten silently twice
      // for the same version) so a migration bug can never lose data.
      try {
        const backupKey = STORAGE_KEY + '_backup_v' + (parsed.schemaVersion || 1);
        if (!localStorage.getItem(backupKey)) {
          localStorage.setItem(backupKey, raw);
        }
      } catch (backupErr) {
        console.warn('Could not write pre-migration backup:', backupErr);
      }
      const migrated = migrateData(parsed);
      saveData(migrated);
      return migrated;
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
    const customer = getCustomerById(id);
    if (!customer) return;

    const linkedQuotations = appData.quotations.filter(q => q.customerId === id);
    const linkedInvoices = appData.invoices.filter(inv => inv.customerId === id);
    const linkedPayments = appData.payments.filter(p => p.customerId === id);
    const hasLinkedRecords = linkedQuotations.length > 0 || linkedInvoices.length > 0 || linkedPayments.length > 0;

    if (hasLinkedRecords) {
        const summary = `${linkedQuotations.length} quotation(s), ${linkedInvoices.length} invoice(s), ${linkedPayments.length} payment(s)`;
        const proceed = confirm(
            `"${customer.name}" has linked records (${summary}).\n\n` +
            `Deleting the customer would orphan these records, so instead the customer will be DEACTIVATED ` +
            `(hidden from new document creation, but existing documents keep their historical snapshot and remain intact).\n\n` +
            `Deactivate "${customer.name}"?`
        );
        if (!proceed) return;
        customer.active = false;
        saveData();
        renderCustomers(document.getElementById('customerSearch')?.value || '');
        toast('Customer deactivated (had linked records)', 'info');
        return;
    }

    if (!confirm(`Delete customer "${customer.name}"? This customer has no linked documents.`)) return;
    appData.customers = appData.customers.filter(c => c.id !== id);
    saveData();
    renderCustomers();
    toast('Customer deleted', 'info');
}

function reactivateCustomer(id) {
    if (!requireAdmin()) return;
    const customer = getCustomerById(id);
    if (!customer) return;
    customer.active = true;
    saveData();
    renderCustomers(document.getElementById('customerSearch')?.value || '');
    toast('Customer reactivated', 'success');
}

function getCustomerById(id) {
    return appData.customers.find(c => c.id === id) || null;
}

function generateCustomerId() {
    const existing = appData.customers;
    const maxId = existing.reduce((max, c) => {
        const num = parseInt((c.id || '').replace('CUST-', ''), 10);
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
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:2rem; color:var(--gray-400);">No customers found.</td></tr>`;
    return;
  }
  
  tbody.innerHTML = customers.map(c => `
    <tr style="${c.active === false ? 'opacity:0.5;' : ''}">
      <td><strong>${escapeHtml(c.id)}</strong></td>
      <td>${escapeHtml(c.name || '')}</td>
      <td>${escapeHtml(c.company || '')}</td>
      <td>${escapeHtml(c.phone || '')}</td>
      <td>${escapeHtml(c.email || '')}</td>
      <td>${escapeHtml(c.gstin || '')}</td>
      <td>₹${(c.openingBalance || 0).toFixed(2)}</td>
      <td>${c.active === false ? '<span class="status-badge status-cancelled">Inactive</span>' : '<span class="status-badge status-approved">Active</span>'}</td>
      <td>
        <div class="action-btns admin-only">
          <button class="view-ledger-customer" data-id="${c.id}" title="Ledger"><i class="fas fa-book"></i></button>
          <button class="edit-customer" data-id="${c.id}" title="Edit"><i class="fas fa-edit"></i></button>
          ${c.active === false
            ? `<button class="reactivate-customer" data-id="${c.id}" title="Reactivate"><i class="fas fa-undo"></i></button>`
            : `<button class="delete-customer" data-id="${c.id}" title="Delete"><i class="fas fa-trash"></i></button>`}
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
  tbody.querySelectorAll('.reactivate-customer').forEach(btn => {
    btn.addEventListener('click', function() {
      reactivateCustomer(this.dataset.id);
    });
  });
  tbody.querySelectorAll('.view-ledger-customer').forEach(btn => {
    btn.addEventListener('click', function() {
      navigate('ledger');
      const sel = document.getElementById('ledgerCustomerSelect');
      if (sel) { sel.value = this.dataset.id; renderLedger(); }
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
            dateField.value = customer.createdDate || formatLocalDate(new Date());
        } else {
            toast('Customer not found', 'error');
            return;
        }
    } else {
        title.innerHTML = `<i class="fas fa-user-plus" style="color:var(--gold);"></i> Add Customer`;
        dateField.value = formatLocalDate(new Date());
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
    const createdDate = document.getElementById('custCreatedDate').value || formatLocalDate(new Date());
    
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
  if (!quotation.status) quotation.status = 'Pending';
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
  if (!invoice.status) invoice.status = 'Unpaid';
  if (invoice.paidAmount === undefined) invoice.paidAmount = 0;
  if (!invoice.dueDate) invoice.dueDate = invoice.quoteDate || '';
  const idx = appData.invoices.findIndex(i => i.id === invoice.id);
  if (idx >= 0) appData.invoices[idx] = invoice;
  else appData.invoices.push(invoice);
  saveData();
  recalculateInvoiceBalance(invoice.id);
  return invoice;
}
function deleteInvoice(id) {
  const invoice = getInvoice(id);
  if (!invoice) return;
  const linkedPayments = appData.payments.filter(p => p.invoiceId === id);
  if (linkedPayments.length > 0) {
    const proceed = confirm(
      `This invoice has ${linkedPayments.length} linked payment(s) totalling ₹${linkedPayments.reduce((s, p) => s + (p.amount || 0), 0).toFixed(2)}.\n` +
      `Deleting the invoice will UNLINK these payments (they will remain in Payments as unallocated / customer credit, not lost).\n\nContinue?`
    );
    if (!proceed) return false;
    linkedPayments.forEach(p => { p.invoiceId = null; });
  }
  appData.invoices = appData.invoices.filter(i => i.id !== id);
  saveData();
  return true;
}

function convertQuotationToInvoice(quotationId) {
  const quotation = getQuotation(quotationId);
  if (!quotation) throw new Error("Quotation not found");

  const existingInvoice = appData.invoices.find(i => i.quotationId === quotationId);
  if (existingInvoice) return existingInvoice;

  const todayStr = formatLocalDate(new Date());
  const invoice = {
    ...JSON.parse(JSON.stringify(quotation)),
    id: generateId('inv'),
    quotationId: quotation.id,
    documentNo: generateDocumentNumber('invoice', todayStr),
    quoteDate: todayStr,
    dueDate: todayStr,
    status: 'Unpaid',
    paidAmount: 0
  };
  delete invoice.__quotationOnlyFlag;

  quotation.status = 'Approved';
  quotation.convertedToInvoiceId = invoice.id;
  saveQuotation(quotation);
  saveInvoice(invoice);

  return invoice;
}

// ─── PAYMENTS ────────────────────────────────────────────────
function getPayments() { return appData.payments; }
function getPayment(id) { return appData.payments.find(p => p.id === id) || null; }

function recalculateInvoiceBalance(invoiceId) {
  const invoice = getInvoice(invoiceId);
  if (!invoice) return;
  const allocated = appData.payments
    .filter(p => p.invoiceId === invoiceId)
    .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
  const grandTotal = computeDocumentTotals(invoice).grandTotal;
  invoice.paidAmount = allocated;
  const balance = grandTotal - allocated;
  if (invoice.status === 'Cancelled') {
    // cancelled invoices keep their explicit status regardless of balance
  } else if (Math.abs(balance) < 0.005) {
    invoice.status = 'Paid';
  } else if (balance < 0) {
    invoice.status = 'Overpaid';
  } else if (allocated > 0) {
    invoice.status = 'Partially Paid';
  } else {
    invoice.status = 'Unpaid';
  }
  saveData();
}

function savePayment(payment) {
  if (!payment.id) payment.id = generateId('pay');
  if (!payment.paymentNo) payment.paymentNo = generatePaymentNumber(payment.date);
  if (!payment.method) payment.method = 'Cash';
  const idx = appData.payments.findIndex(p => p.id === payment.id);
  if (idx >= 0) appData.payments[idx] = payment;
  else appData.payments.push(payment);
  saveData();
  if (payment.invoiceId) recalculateInvoiceBalance(payment.invoiceId);
  return payment;
}

function deletePayment(id) {
  const payment = getPayment(id);
  if (!payment) return;
  const invoiceId = payment.invoiceId;
  appData.payments = appData.payments.filter(p => p.id !== id);
  saveData();
  if (invoiceId) recalculateInvoiceBalance(invoiceId);
}

function computeDocumentTotals(doc) {
  const items = doc.items || [];
  const subtotal = items.reduce((sum, it) => sum + ((parseFloat(it.qty) || 0) * (parseFloat(it.unitPrice) || 0)), 0);
  const gstRate = parseFloat(doc.gstRate) || 0;
  const gstAmount = subtotal * gstRate / 100;
  const grandTotal = subtotal + gstAmount;
  return { subtotal, gstAmount, grandTotal, gstRate };
}

// ─── PAYMENTS UI ─────────────────────────────────────────────────
function populatePaymentCustomerSelect(selectEl, selectedId = '') {
  if (!selectEl) return;
  const activeCustomers = appData.customers.filter(c => c.active !== false);
  selectEl.innerHTML = '<option value="">Select customer…</option>' +
    activeCustomers.map(c => `<option value="${c.id}">${escapeHtml(c.name)}${c.company ? ' — ' + escapeHtml(c.company) : ''}</option>`).join('');
  selectEl.value = selectedId;
}

function populatePaymentInvoiceSelect(selectEl, customerId, selectedId = '') {
  if (!selectEl) return;
  if (!customerId) {
    selectEl.innerHTML = '<option value="">— No invoice (unallocated / advance) —</option>';
    return;
  }
  const invoices = appData.invoices.filter(inv => inv.customerId === customerId && inv.status !== 'Cancelled');
  selectEl.innerHTML = '<option value="">— No invoice (unallocated / advance) —</option>' +
    invoices.map(inv => {
      const totals = computeDocumentTotals(inv);
      const balance = totals.grandTotal - (inv.paidAmount || 0);
      return `<option value="${inv.id}">${escapeHtml(inv.documentNo)} — Balance ₹${balance.toFixed(2)}</option>`;
    }).join('');
  selectEl.value = selectedId;
}

function openPaymentModal(prefillInvoiceId = null) {
  if (!requireAdmin('record payment')) return;
  const overlay = document.getElementById('paymentModalOverlay');
  if (!overlay) return;

  const idField = document.getElementById('paymentId');
  const custSelect = document.getElementById('paymentCustomer');
  const invSelect = document.getElementById('paymentInvoice');
  const dateField = document.getElementById('paymentDate');
  const amountField = document.getElementById('paymentAmount');
  const methodField = document.getElementById('paymentMethod');
  const refField = document.getElementById('paymentReference');
  const notesField = document.getElementById('paymentNotes');
  const titleEl = document.getElementById('paymentModalTitle');

  if (idField) idField.value = '';
  if (titleEl) titleEl.innerHTML = `<i class="fas fa-money-check-alt" style="color:var(--gold);"></i> Record Payment`;

  let prefillCustomerId = '';
  if (prefillInvoiceId) {
    const inv = getInvoice(prefillInvoiceId);
    if (inv) prefillCustomerId = inv.customerId || '';
  }

  populatePaymentCustomerSelect(custSelect, prefillCustomerId);
  populatePaymentInvoiceSelect(invSelect, prefillCustomerId, prefillInvoiceId || '');

  if (custSelect) {
    custSelect.onchange = () => {
      populatePaymentInvoiceSelect(invSelect, custSelect.value);
      if (methodField) {} // no-op, keeps linter happy
    };
  }
  if (invSelect && prefillInvoiceId) {
    const inv = getInvoice(prefillInvoiceId);
    if (inv && amountField) {
      const totals = computeDocumentTotals(inv);
      const balance = totals.grandTotal - (inv.paidAmount || 0);
      amountField.value = balance > 0 ? balance.toFixed(2) : '';
    }
  } else if (amountField) {
    amountField.value = '';
  }

  if (dateField) dateField.value = formatLocalDate(new Date());
  if (methodField) methodField.value = 'Cash';
  if (refField) refField.value = '';
  if (notesField) notesField.value = '';

  overlay.classList.add('open');
}

function closePaymentModal() {
  const overlay = document.getElementById('paymentModalOverlay');
  if (overlay) overlay.classList.remove('open');
}

function editPayment(id) {
  if (!requireAdmin('edit payment')) return;
  const payment = getPayment(id);
  if (!payment) return;
  openPaymentModal(payment.invoiceId);
  document.getElementById('paymentId').value = payment.id;
  document.getElementById('paymentCustomer').value = payment.customerId || '';
  populatePaymentInvoiceSelect(document.getElementById('paymentInvoice'), payment.customerId, payment.invoiceId || '');
  document.getElementById('paymentDate').value = payment.date || formatLocalDate(new Date());
  document.getElementById('paymentAmount').value = payment.amount || 0;
  document.getElementById('paymentMethod').value = payment.method || 'Cash';
  document.getElementById('paymentReference').value = payment.reference || '';
  document.getElementById('paymentNotes').value = payment.notes || '';
  document.getElementById('paymentModalTitle').innerHTML = `<i class="fas fa-edit" style="color:var(--gold);"></i> Edit Payment`;
}

function savePaymentForm(event) {
  event.preventDefault();
  if (!requireAdmin('record payment')) return;

  const idField = document.getElementById('paymentId');
  const customerId = document.getElementById('paymentCustomer').value;
  const invoiceId = document.getElementById('paymentInvoice').value || null;
  const date = document.getElementById('paymentDate').value;
  const amount = parseFloat(document.getElementById('paymentAmount').value);
  const method = document.getElementById('paymentMethod').value;
  const reference = document.getElementById('paymentReference').value.trim();
  const notes = document.getElementById('paymentNotes').value.trim();

  if (!customerId) { toast('Please select a customer', 'error'); return; }
  if (!date) { toast('Please select a payment date', 'error'); return; }
  if (!Number.isFinite(amount) || amount <= 0) { toast('Please enter a valid payment amount', 'error'); return; }

  const existingId = idField.value;
  const payment = existingId ? getPayment(existingId) : {};
  if (!payment) { toast('Payment not found', 'error'); return; }

  payment.customerId = customerId;
  payment.invoiceId = invoiceId;
  payment.date = date;
  payment.amount = amount;
  payment.method = method;
  payment.reference = reference;
  payment.notes = notes;

  savePayment(payment);
  toast(existingId ? 'Payment updated' : `Payment recorded: ${payment.paymentNo}`, 'success');
  closePaymentModal();
  renderPayments();
  updateDashboard();
  if (currentFileData && currentDocType === 'invoice' && currentFileData.id === invoiceId) {
    renderFileToUI(currentFileData);
  }
}

function removePayment(id) {
  if (!requireAdmin('delete payment')) return;
  const payment = getPayment(id);
  if (!payment) return;
  if (!confirm(`Delete payment ${payment.paymentNo}? The linked invoice balance will be recalculated.`)) return;
  deletePayment(id);
  renderPayments();
  updateDashboard();
  if (currentFileData && currentDocType === 'invoice' && currentFileData.id === payment.invoiceId) {
    renderFileToUI(currentFileData);
  }
  toast('Payment deleted, invoice balance recalculated', 'info');
}

function renderPayments() {
  const tbody = document.getElementById('paymentsBody');
  if (!tbody) return;

  const filterSelect = document.getElementById('paymentsCustomerFilter');
  if (filterSelect && filterSelect.options.length <= 1) {
    populatePaymentCustomerSelect(filterSelect);
    filterSelect.insertAdjacentHTML('afterbegin', '<option value="">All customers</option>');
    filterSelect.value = '';
  }

  const searchVal = (document.getElementById('paymentsSearch')?.value || '').toLowerCase();
  const customerFilter = filterSelect?.value || '';

  let payments = [...appData.payments].sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.paymentNo || '').localeCompare(a.paymentNo || ''));

  if (customerFilter) payments = payments.filter(p => p.customerId === customerFilter);
  if (searchVal) {
    payments = payments.filter(p => {
      const customer = getCustomerById(p.customerId);
      const invoice = p.invoiceId ? getInvoice(p.invoiceId) : null;
      return (p.paymentNo || '').toLowerCase().includes(searchVal) ||
        (customer?.name || '').toLowerCase().includes(searchVal) ||
        (invoice?.documentNo || '').toLowerCase().includes(searchVal) ||
        (p.reference || '').toLowerCase().includes(searchVal);
    });
  }

  if (payments.length === 0) {
    tbody.innerHTML = '<tr class="empty-state-row"><td colspan="8">No payments found.</td></tr>';
    return;
  }

  tbody.innerHTML = payments.map(p => {
    const customer = getCustomerById(p.customerId);
    const invoice = p.invoiceId ? getInvoice(p.invoiceId) : null;
    return `
      <tr>
        <td><strong>${escapeHtml(p.paymentNo || '')}</strong></td>
        <td>${p.date ? parseLocalDate(p.date).toLocaleDateString('en-GB') : ''}</td>
        <td>${escapeHtml(customer?.name || 'Unknown')}</td>
        <td>${invoice ? escapeHtml(invoice.documentNo) : '<em style="color:var(--gray-400);">Unallocated</em>'}</td>
        <td class="text-right">₹${(p.amount || 0).toFixed(2)}</td>
        <td>${escapeHtml(p.method || '')}</td>
        <td>${escapeHtml(p.reference || '')}</td>
        <td>
          <div class="action-btns admin-only">
            <button onclick="editPayment('${p.id}')" title="Edit"><i class="fas fa-edit"></i></button>
            <button onclick="removePayment('${p.id}')" title="Delete"><i class="fas fa-trash"></i></button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// ─── CUSTOMER LEDGER ─────────────────────────────────────────────
function buildCustomerLedgerEntries(customerId) {
  const customer = getCustomerById(customerId);
  if (!customer) return [];
  const entries = [];

  if (customer.openingBalance) {
    entries.push({
      date: customer.createdDate || '0000-01-01',
      ref: 'Opening Balance',
      particulars: 'Opening Balance',
      debit: customer.openingBalance > 0 ? customer.openingBalance : 0,
      credit: customer.openingBalance < 0 ? -customer.openingBalance : 0,
      sortKey: '0000-00-00-0'
    });
  }

  appData.invoices.filter(inv => inv.customerId === customerId && inv.status !== 'Cancelled').forEach(inv => {
    const totals = computeDocumentTotals(inv);
    entries.push({
      date: inv.quoteDate,
      ref: inv.documentNo,
      particulars: 'Invoice — Tax Invoice',
      debit: totals.grandTotal,
      credit: 0,
      sortKey: (inv.quoteDate || '') + '-1-' + (inv.documentNo || '')
    });
  });

  appData.payments.filter(p => p.customerId === customerId).forEach(p => {
    const invoice = p.invoiceId ? getInvoice(p.invoiceId) : null;
    entries.push({
      date: p.date,
      ref: p.paymentNo,
      particulars: invoice ? `Payment against ${invoice.documentNo}` : 'Payment (unallocated / advance)',
      debit: 0,
      credit: p.amount || 0,
      sortKey: (p.date || '') + '-2-' + (p.paymentNo || '')
    });
  });

  entries.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  let running = 0;
  entries.forEach(e => {
    running += (e.debit || 0) - (e.credit || 0);
    e.balance = running;
  });

  return entries;
}

function populateLedgerCustomerSelect() {
  const select = document.getElementById('ledgerCustomerSelect');
  if (!select) return;
  const currentVal = select.value;
  populatePaymentCustomerSelect(select, currentVal);
  select.insertAdjacentHTML('afterbegin', '<option value="">Select a customer…</option>');
  select.value = currentVal;
}

function renderLedger() {
  const select = document.getElementById('ledgerCustomerSelect');
  if (!select) return;
  if (select.options.length === 0) populateLedgerCustomerSelect();

  const tbody = document.getElementById('ledgerBody');
  if (!tbody) return;

  const customerId = select.value;
  if (!customerId) {
    tbody.innerHTML = '<tr class="empty-state-row"><td colspan="6">Select a customer to view their ledger.</td></tr>';
    return;
  }

  const entries = buildCustomerLedgerEntries(customerId);
  if (entries.length === 0) {
    tbody.innerHTML = '<tr class="empty-state-row"><td colspan="6">No transactions for this customer.</td></tr>';
    return;
  }

  tbody.innerHTML = entries.map(e => `
    <tr>
      <td>${e.date && e.date !== '0000-01-01' ? parseLocalDate(e.date).toLocaleDateString('en-GB') : '—'}</td>
      <td>${escapeHtml(e.ref)}</td>
      <td>${escapeHtml(e.particulars)}</td>
      <td class="text-right">${e.debit ? '₹' + e.debit.toFixed(2) : ''}</td>
      <td class="text-right">${e.credit ? '₹' + e.credit.toFixed(2) : ''}</td>
      <td class="text-right ledger-balance-cell ${e.balance >= 0 ? 'dr' : 'cr'}">₹${Math.abs(e.balance).toFixed(2)} ${e.balance >= 0 ? 'Dr' : 'Cr'}</td>
    </tr>
  `).join('');
}

// ─── STATEMENT OF ACCOUNT ────────────────────────────────────────
function populateStatementCustomerSelect() {
  const select = document.getElementById('statementCustomerSelect');
  if (!select) return;
  const currentVal = select.value;
  populatePaymentCustomerSelect(select, currentVal);
  select.insertAdjacentHTML('afterbegin', '<option value="">Select a customer…</option>');
  select.value = currentVal;
  renderStatement();
}

function renderStatement() {
  const select = document.getElementById('statementCustomerSelect');
  const tbody = document.getElementById('statementBody');
  const summaryEl = document.getElementById('statementSummary');
  if (!select || !tbody) return;

  const customerId = select.value;
  const fromDate = document.getElementById('statementFrom')?.value || '';
  const toDate = document.getElementById('statementTo')?.value || '';

  if (!customerId) {
    tbody.innerHTML = '<tr class="empty-state-row"><td colspan="5">Select a customer to view their statement.</td></tr>';
    if (summaryEl) summaryEl.innerHTML = '';
    return;
  }

  const customer = getCustomerById(customerId);
  const allEntries = buildCustomerLedgerEntries(customerId);

  const beforeRange = allEntries.filter(e => fromDate && e.date && e.date < fromDate);
  const openingBalance = beforeRange.length ? beforeRange[beforeRange.length - 1].balance : 0;

  let entriesInRange = allEntries.filter(e => {
    if (fromDate && e.date && e.date < fromDate) return false;
    if (toDate && e.date && e.date > toDate) return false;
    return true;
  });

  let running = openingBalance;
  const rows = [];
  rows.push({ date: fromDate || '—', ref: '', particulars: 'Opening Balance', debit: 0, credit: 0, balance: openingBalance, isOpening: true });
  entriesInRange.forEach(e => {
    running += (e.debit || 0) - (e.credit || 0);
    rows.push({ ...e, balance: running });
  });

  const closingBalance = running;

  tbody.innerHTML = rows.map(r => `
    <tr ${r.isOpening ? 'style="font-weight:700;background:var(--card-bg);"' : ''}>
      <td>${r.isOpening ? '' : (r.date && r.date !== '0000-01-01' ? parseLocalDate(r.date).toLocaleDateString('en-GB') : '—')}</td>
      <td>${escapeHtml(r.ref || '')}</td>
      <td>${escapeHtml(r.particulars)}</td>
      <td class="text-right">${r.debit ? '₹' + r.debit.toFixed(2) : ''}</td>
      <td class="text-right">${r.credit ? '₹' + r.credit.toFixed(2) : ''}</td>
      <td class="text-right ledger-balance-cell ${r.balance >= 0 ? 'dr' : 'cr'}">₹${Math.abs(r.balance).toFixed(2)} ${r.balance >= 0 ? 'Dr' : 'Cr'}</td>
    </tr>
  `).join('');

  if (summaryEl) {
    summaryEl.innerHTML = `
      <div class="gst-summary-card"><div class="gst-label">Customer</div><div class="gst-value" style="font-size:1rem;">${escapeHtml(customer?.name || '')}</div></div>
      <div class="gst-summary-card"><div class="gst-label">Opening Balance</div><div class="gst-value">₹${Math.abs(openingBalance).toFixed(2)} ${openingBalance >= 0 ? 'Dr' : 'Cr'}</div></div>
      <div class="gst-summary-card"><div class="gst-label">Closing Balance</div><div class="gst-value">₹${Math.abs(closingBalance).toFixed(2)} ${closingBalance >= 0 ? 'Dr' : 'Cr'}</div></div>
    `;
  }
}

function printStatement() {
  const select = document.getElementById('statementCustomerSelect');
  if (!select || !select.value) { toast('Select a customer first', 'error'); return; }
  window.print();
}

// ─── GST DASHBOARD ────────────────────────────────────────────────
function renderGstDashboard() {
  const container = document.getElementById('gstSummaryGrid');
  if (!container) return;

  const invoices = appData.invoices.filter(inv => inv.status !== 'Cancelled');
  let taxableValue = 0, gstAmount = 0;
  invoices.forEach(inv => {
    const totals = computeDocumentTotals(inv);
    taxableValue += totals.subtotal;
    gstAmount += totals.gstAmount;
  });

  // Same-state assumption not encoded in data model; show CGST+SGST split
  // (standard intra-state split) alongside total GST. IGST shown as 0 unless
  // a future interstate flag is added to the data model.
  const cgst = gstAmount / 2;
  const sgst = gstAmount / 2;

  container.innerHTML = `
    <div class="gst-summary-card"><div class="gst-label">Total Taxable Sales</div><div class="gst-value">₹${taxableValue.toFixed(2)}</div></div>
    <div class="gst-summary-card"><div class="gst-label">Total GST Amount</div><div class="gst-value">₹${gstAmount.toFixed(2)}</div></div>
    <div class="gst-summary-card"><div class="gst-label">CGST</div><div class="gst-value">₹${cgst.toFixed(2)}</div></div>
    <div class="gst-summary-card"><div class="gst-label">SGST</div><div class="gst-value">₹${sgst.toFixed(2)}</div></div>
    <div class="gst-summary-card"><div class="gst-label">IGST</div><div class="gst-value">₹0.00</div></div>
    <div class="gst-summary-card"><div class="gst-label">Total Invoice Value</div><div class="gst-value">₹${(taxableValue + gstAmount).toFixed(2)}</div></div>
  `;

  const tbody = document.getElementById('gstInvoiceBody');
  if (tbody) {
    if (invoices.length === 0) {
      tbody.innerHTML = '<tr class="empty-state-row"><td colspan="5">No invoices yet.</td></tr>';
    } else {
      tbody.innerHTML = invoices.map(inv => {
        const totals = computeDocumentTotals(inv);
        const customer = inv.customerId ? getCustomerById(inv.customerId) : null;
        return `
          <tr>
            <td>${escapeHtml(inv.documentNo)}</td>
            <td>${escapeHtml(customer?.name || inv.clientName || 'Unknown')}</td>
            <td class="text-right">₹${totals.subtotal.toFixed(2)}</td>
            <td class="text-right">${totals.gstRate}% (₹${totals.gstAmount.toFixed(2)})</td>
            <td class="text-right">₹${totals.grandTotal.toFixed(2)}</td>
          </tr>
        `;
      }).join('');
    }
  }
}

// ─── GLOBAL SEARCH ────────────────────────────────────────────────
function renderGlobalSearchResults(query) {
  const resultsBox = document.getElementById('globalSearchResults');
  if (!resultsBox) return;
  const q = query.trim().toLowerCase();
  if (!q) { resultsBox.innerHTML = ''; resultsBox.style.display = 'none'; return; }

  const results = [];

  appData.customers.forEach(c => {
    if ((c.name || '').toLowerCase().includes(q) || (c.company || '').toLowerCase().includes(q) || (c.phone || '').includes(q)) {
      results.push({ type: 'Customer', label: `${c.name}${c.company ? ' — ' + c.company : ''}`, action: () => { navigate('customers'); } });
    }
  });
  appData.quotations.forEach(qt => {
    if ((qt.documentNo || '').toLowerCase().includes(q) || (qt.clientName || '').toLowerCase().includes(q)) {
      results.push({ type: 'Quotation', label: `${qt.documentNo} — ${qt.clientName || ''}`, action: () => { currentDocType = 'quotation'; currentCategory = qt.categoryId; navigate('docpage'); loadActiveDocument(qt.id); } });
    }
  });
  appData.invoices.forEach(inv => {
    if ((inv.documentNo || '').toLowerCase().includes(q) || (inv.clientName || '').toLowerCase().includes(q)) {
      results.push({ type: 'Invoice', label: `${inv.documentNo} — ${inv.clientName || ''}`, action: () => { currentDocType = 'invoice'; currentCategory = inv.categoryId; navigate('docpage'); loadActiveDocument(inv.id); } });
    }
  });
  appData.payments.forEach(p => {
    if ((p.paymentNo || '').toLowerCase().includes(q) || (p.reference || '').toLowerCase().includes(q)) {
      results.push({ type: 'Payment', label: `${p.paymentNo}`, action: () => { navigate('payments'); } });
    }
  });

  if (results.length === 0) {
    resultsBox.innerHTML = '<div class="search-result-empty">No matches found.</div>';
  } else {
    resultsBox.innerHTML = results.slice(0, 15).map((r, idx) =>
      `<div class="search-result-item" data-idx="${idx}"><span class="sr-type">${r.type}</span> ${escapeHtml(r.label)}</div>`
    ).join('');
    resultsBox.querySelectorAll('.search-result-item').forEach((el, idx) => {
      el.addEventListener('click', () => {
        results[idx].action();
        resultsBox.style.display = 'none';
        const input = document.getElementById('globalSearchInput');
        if (input) input.value = '';
      });
    });
  }
  resultsBox.style.display = 'block';
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

function requireAdmin(action = '') {
  if (currentRole !== 'admin') {
    toast(action ? `Viewer mode: cannot ${action}` : 'Viewer mode: read-only', 'error');
    return false;
  }
  return true;
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
  const activeRole =
    document.querySelector('.role-badge.active')?.dataset.role || 'admin';

  const pwdInput = document.getElementById('loginPassword');
  const errorEl = document.getElementById('loginError');

  // Viewer does not require a password.
  if (activeRole === 'viewer') {
    isLoggedIn = true;
    setRole('viewer');
    hideLogin();

    localStorage.setItem(LOGIN_STORAGE_KEY, 'logged_in_viewer');

    renderCategories();
    loadActiveDocument();
    navigate('dashboard');
    updateDashboard();

    toast('Logged in as Viewer', 'success');
    return;
  }

  // Admin requires the configured password.
  const password = pwdInput ? pwdInput.value.trim() : '';
  const savedPassword =
    appData?.settings?.adminPassword || 'admin123';

  if (password === savedPassword) {
    isLoggedIn = true;
    setRole('admin');
    hideLogin();

    localStorage.setItem(LOGIN_STORAGE_KEY, 'logged_in_admin');

    renderCategories();
    loadActiveDocument();
    navigate('dashboard');
    updateDashboard();

    if (pwdInput) {
      pwdInput.value = '';
    }

    toast('Welcome back, Admin!', 'success');
    return;
  }

  if (errorEl) {
    errorEl.textContent = 'Incorrect password. Please try again.';
    errorEl.classList.add('show');
  }

  if (pwdInput) {
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
  
// Never create a document merely because a page/category was opened.
// Documents are created ONLY through the New File action.
if (!currentFileData) {
  currentDocId = null;

  renderFileToUI(null);
  renderMonthlyFilesList();
  updatePageTitle();
  initSortable();
  updateDashboard();

  return;
}
  
  currentDocId = currentFileData.id;
  renderFileToUI(currentFileData);
  updatePageTitle();
  initSortable();
  updateDashboard();
}

// ─── DASHBOARD ──────────────────────────────────────────────────
// IMPORTANT: Quotation value (potential business) and Invoice value (actual
// sales) are NEVER combined into one "revenue" figure — that would
// misrepresent unconfirmed quotations as real sales.
function updateDashboard() {
  const quotations = appData.quotations;
  const invoices = appData.invoices.filter(inv => inv.status !== 'Cancelled');
  const allDocsForItemCount = [...appData.quotations, ...appData.invoices];

  let totalItems = 0;
  const categoryRevenue = {}; // invoice-based only (actual sales), non-cancelled
  CATEGORIES.forEach(c => categoryRevenue[c.id] = 0);

  let quotationValue = 0;
  quotations.forEach(q => {
    totalItems += (q.items || []).length;
    quotationValue += computeDocumentTotals(q).grandTotal;
  });

  let invoiceValue = 0, amountReceived = 0, outstanding = 0, gstCollected = 0;
  invoices.forEach(inv => {
    totalItems += (inv.items || []).length;
    const totals = computeDocumentTotals(inv);
    invoiceValue += totals.grandTotal;
    gstCollected += totals.gstAmount;
    amountReceived += (inv.paidAmount || 0);
    if (inv.categoryId && categoryRevenue[inv.categoryId] !== undefined) {
      categoryRevenue[inv.categoryId] += totals.grandTotal;
    }
  });
  outstanding = invoiceValue - amountReceived;

  const setText = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };

  // Original 4 stat cards — reinterpreted correctly (no quote/invoice mixing).
  setText('statFiles', quotations.length + invoices.length);
  setText('statItems', totalItems);
  setText('statRevenue', '₹' + invoiceValue.toFixed(2)); // actual invoiced sales value only
  const activeCats = new Set([...quotations, ...invoices].map(d => d.categoryId).filter(Boolean));
  setText('statActive', activeCats.size);

  // Extended stats (rendered if the corresponding elements exist in HTML)
  setText('statQuotationValue', '₹' + quotationValue.toFixed(2));
  setText('statInvoiceValue', '₹' + invoiceValue.toFixed(2));
  setText('statAmountReceived', '₹' + amountReceived.toFixed(2));
  setText('statOutstanding', '₹' + outstanding.toFixed(2));
  setText('statGstCollected', '₹' + gstCollected.toFixed(2));

  setText('statTotalCustomers', appData.customers.filter(c => c.active !== false).length);
  setText('statTotalQuotations', quotations.length);
  setText('statPendingQuotations', quotations.filter(q => q.status === 'Pending').length);
  setText('statApprovedQuotations', quotations.filter(q => q.status === 'Approved').length);
  setText('statRejectedQuotations', quotations.filter(q => q.status === 'Rejected').length);
  setText('statTotalInvoices', appData.invoices.length);
  setText('statPaidInvoices', appData.invoices.filter(i => i.status === 'Paid').length);
  setText('statPartiallyPaidInvoices', appData.invoices.filter(i => i.status === 'Partially Paid').length);
  setText('statUnpaidInvoices', appData.invoices.filter(i => i.status === 'Unpaid').length);
  setText('statCancelledInvoices', appData.invoices.filter(i => i.status === 'Cancelled').length);

  // Recent Documents List
  const allDocs = [...quotations, ...invoices];
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
            <span class="file-month">${escapeHtml(docNo)}</span>
            <span class="file-cat">${escapeHtml(catLabel)}</span>
          </li>
        `;
      }).join('');
    }
  }

  // Category Revenue Chart (Pie) — based on actual invoiced sales only
  const chartEl = document.getElementById('categoryPieChart');
  if (chartEl && typeof Chart === 'undefined') {
    console.warn('Chart.js failed to load (offline/CDN blocked) — skipping charts.');
  }
  if (chartEl && typeof Chart !== 'undefined') {
    const labels = CATEGORIES.map(c => c.label);
    const data = CATEGORIES.map(c => categoryRevenue[c.id] || 0);
    const hasData = data.some(v => v > 0);
    const ctx = chartEl.getContext('2d');
    if (categoryChart) categoryChart.destroy();
    categoryChart = new Chart(ctx, {
      type: 'pie',
      data: {
        labels: hasData ? labels : ['No invoiced sales yet'],
        datasets: [{
          data: hasData ? data : [1],
          backgroundColor: hasData ? [
            '#1a5e33', '#2d7a46', '#3a9d5e', '#10b981',
            '#34d399', '#6ee7a0', '#a7f3d0', '#d1fae5'
          ] : ['#e2e8f0'],
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

  // Monthly Bar Chart — invoiced sales value by month
  const barEl = document.getElementById('monthlyBarChart');
  if (barEl && typeof Chart !== 'undefined') {
    const ctxBar = barEl.getContext('2d');
    const monthMap = {};
    invoices.forEach(doc => {
      const dateStr = doc.quoteDate || '';
      if (dateStr) {
        const m = dateStr.substring(0, 7); // YYYY-MM
        const total = computeDocumentTotals(doc).grandTotal;
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
        labels: barLabels.length ? barLabels : ['No data'],
        datasets: [{
          label: 'Monthly Invoiced Sales (₹)',
          data: barData.length ? barData : [0],
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

  // Group documents by their actual document date (quoteDate), newest date first.
  // This reflects real independent documents grouped by date — not fake
  // monthly buckets.
  const groups = {};
  filteredDocs.forEach(doc => {
    const dateKey = doc.quoteDate || 'No date';
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(doc);
  });

  const sortedDateKeys = Object.keys(groups).sort((a, b) => {
    if (a === 'No date') return 1;
    if (b === 'No date') return -1;
    return b.localeCompare(a); // newest first, YYYY-MM-DD sorts lexically
  });

  const formatDateLabel = (dateKey) => {
    if (dateKey === 'No date') return 'No date';
    const d = parseLocalDate(dateKey);
    if (Number.isNaN(d.getTime())) return dateKey;
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  list.innerHTML = '';
  sortedDateKeys.forEach(dateKey => {
    const groupHeader = document.createElement('li');
    groupHeader.className = 'date-group-header';
    groupHeader.style.cssText = 'font-size:0.65rem;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;opacity:0.65;padding:0.5rem 0.6rem 0.2rem;pointer-events:none;';
    groupHeader.textContent = formatDateLabel(dateKey);
    list.appendChild(groupHeader);

    // Newest-created document last in each date group reads oddly; show in
    // document-number order (stable, matches numbering sequence) descending.
    const docsInGroup = groups[dateKey].slice().sort((a, b) => (b.documentNo || '').localeCompare(a.documentNo || '', undefined, { numeric: true }));

    docsInGroup.forEach(doc => {
      const li = document.createElement('li');
      li.className = doc.id === currentDocId ? 'active-file' : '';
      const label = doc.documentNo || 'Draft';
      const statusText = doc.status ? ` <span class="status-badge status-${doc.status.toLowerCase().replace(/\s+/g, '-')}" style="margin-left:4px;padding:0.05rem 0.4rem;font-size:0.55rem;">${doc.status}</span>` : '';

      li.innerHTML = `
        <span>${escapeHtml(label)}${statusText}</span>
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
            let proceeded = true;
            if (currentDocType === 'invoice') {
              proceeded = deleteInvoice(doc.id);
            } else {
              deleteQuotation(doc.id);
            }
            if (proceeded === false) return; // user cancelled the payment-unlink confirm

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

// Document-type-aware field key for the number field: quotations use
// 'quoteNo' (element q_quoteNo), invoices use 'invoiceNo' (element i_invoiceNo).
// Keeping these distinct avoids ever conflating the two, per the explicit
// document model requirement.
function getDocNumberFieldKey() {
  return currentDocType === 'quotation' ? 'quoteNo' : 'invoiceNo';
}

function renderFileToUI(file) {
  if (!file) return;
  const fields = [
    'quoteDate', 'poNo', 'projectArea', 'brandName',
    'vendorName', 'vendorCompany', 'vendorAddress', 'vendorPhone', 'vendorEmail', 'vendorWebsite', 'vendorGst',
    'clientName', 'clientCompany', 'clientAddress', 'clientPhone', 'clientGst',
    'projectName', 'projectLocation', 'projectScope', 'projectStartDate', 'projectEndDate', 'projectManager',
    'termsPayment', 'termsWarranty', 'termsSite', 'termsDeclaration'
  ];
  if (currentDocType === 'invoice') fields.push('dueDate');

  fields.forEach(key => {
    const el = getFieldElement(key);
    if (el) el.value = file[key] || '';
  });

  // Document number: explicit per-type field, no cross-type fallback.
  const numEl = getFieldElement(getDocNumberFieldKey());
  if (numEl) numEl.value = file.documentNo || '';

  const gstEl = getFieldElement('gstRate');
  if (gstEl && file.gstRate !== undefined) {
    gstEl.value = file.gstRate;
  }

  renderCustomerPicker(file);
  renderDocStatusBar(file);
  if (currentDocType === 'invoice') renderInvoicePaymentInfo(file);

  renderItems(file.items || []);
  if (typeof updateTotals === 'function') updateTotals();
}

// ─── CUSTOMER PICKER ON DOCUMENT ───────────────────────────────
function renderCustomerPicker(file) {
  const prefix = currentDocType === 'quotation' ? 'q_' : 'i_';
  const wrap = document.getElementById(prefix + 'customerPickerWrap');
  if (!wrap) return;
  const select = wrap.querySelector('select');
  if (!select) return;

  const activeCustomers = appData.customers.filter(c => c.active !== false);
  select.innerHTML = '<option value="">— Not linked to Customer Master —</option>' +
    activeCustomers.map(c => `<option value="${c.id}">${escapeHtml(c.name)}${c.company ? ' — ' + escapeHtml(c.company) : ''}</option>`).join('');

  select.value = file.customerId || '';

  select.onchange = () => {
    if (!requireAdmin('link customer')) { select.value = file.customerId || ''; return; }
    const customer = getCustomerById(select.value);
    file.customerId = select.value || null;
    if (customer) {
      // Populate client fields from the customer master, and store a fresh
      // historical snapshot so later Customer Master edits never retroactively
      // change this document.
      file.clientName = customer.name || '';
      file.clientCompany = customer.company || '';
      file.clientAddress = customer.address || '';
      file.clientPhone = customer.phone || '';
      file.clientGst = customer.gstin || '';
      file.customerSnapshot = {
        name: customer.name || '', company: customer.company || '',
        address: customer.address || '', phone: customer.phone || '', gstin: customer.gstin || ''
      };
      renderFileToUI(file);
      collectItemsAndSave();
      toast('Customer linked and details populated', 'success');
    } else {
      collectItemsAndSave();
    }
  };
}

// ─── DOCUMENT STATUS BAR ────────────────────────────────────────
function renderDocStatusBar(file) {
  const prefix = currentDocType === 'quotation' ? 'q_' : 'i_';
  const bar = document.getElementById(prefix + 'statusBar');
  if (!bar) return;

  if (currentDocType === 'quotation') {
    const statusSelect = bar.querySelector('.status-select');
    if (statusSelect) {
      statusSelect.value = file.status || 'Pending';
      statusSelect.onchange = () => {
        if (!requireAdmin('change status')) { statusSelect.value = file.status || 'Pending'; return; }
        file.status = statusSelect.value;
        saveQuotation(file);
        toast('Status updated to ' + file.status, 'success');
        updateDashboard();
      };
    }
    const convertBtn = bar.querySelector('.convert-btn');
    if (convertBtn) {
      const alreadyConverted = !!appData.invoices.find(i => i.quotationId === file.id);
      convertBtn.style.display = alreadyConverted ? 'none' : '';
      convertBtn.onclick = () => window.convertActiveQuotationToInvoice();
    }
    const convertedNote = bar.querySelector('.converted-note');
    if (convertedNote) {
      const linkedInvoice = appData.invoices.find(i => i.quotationId === file.id);
      convertedNote.style.display = linkedInvoice ? '' : 'none';
      convertedNote.textContent = linkedInvoice ? `Converted → ${linkedInvoice.documentNo}` : '';
    }
  } else {
    const statusSelect = bar.querySelector('.status-select');
    if (statusSelect) {
      const opts = ['Unpaid', 'Partially Paid', 'Paid', 'Overpaid', 'Cancelled'];
      statusSelect.innerHTML = opts.map(o => `<option value="${o}">${o}</option>`).join('');
      statusSelect.value = file.status || 'Unpaid';
      statusSelect.onchange = () => {
        if (!requireAdmin('change status')) { statusSelect.value = file.status || 'Unpaid'; return; }
        file.status = statusSelect.value;
        saveInvoice(file);
        toast('Status updated to ' + file.status, 'success');
        updateDashboard();
      };
    }
    const recordPaymentBtn = bar.querySelector('.record-payment-btn');
    if (recordPaymentBtn) {
      recordPaymentBtn.onclick = () => openPaymentModal(file.id);
    }
  }
}

function renderInvoicePaymentInfo(file) {
  const box = document.getElementById('i_paymentInfoBox');
  if (!box) return;
  const totals = computeDocumentTotals(file);
  const paid = file.paidAmount || 0;
  const balance = totals.grandTotal - paid;
  box.querySelector('.pv-total').textContent = '₹' + totals.grandTotal.toFixed(2);
  box.querySelector('.pv-paid').textContent = '₹' + paid.toFixed(2);
  box.querySelector('.pv-balance').textContent = '₹' + balance.toFixed(2);
  const statusBadge = box.querySelector('.pv-status');
  if (statusBadge) {
    statusBadge.textContent = file.status || 'Unpaid';
    statusBadge.className = 'status-badge pv-status status-' + (file.status || 'unpaid').toLowerCase().replace(/\s+/g, '-');
  }
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
    'quoteDate', 'poNo', 'projectArea', 'brandName',
    'vendorName', 'vendorCompany', 'vendorAddress', 'vendorPhone', 'vendorEmail', 'vendorWebsite', 'vendorGst',
    'clientName', 'clientCompany', 'clientAddress', 'clientPhone', 'clientGst',
    'projectName', 'projectLocation', 'projectScope', 'projectStartDate', 'projectEndDate', 'projectManager',
    'termsPayment', 'termsWarranty', 'termsSite', 'termsDeclaration'
  ];
  if (currentDocType === 'invoice') fields.push('dueDate');

  fields.forEach(key => {
    const el = getFieldElement(key);
    if (el) currentFileData[key] = el.value;
  });

  // Document number field is per-type and explicit (q_quoteNo / i_invoiceNo).
  const numEl = getFieldElement(getDocNumberFieldKey());
  if (numEl && numEl.value.trim()) {
    // Admin may hand-edit the displayed number; respect it, but never let it
    // become blank (falls back to the stored documentNo if cleared).
    currentFileData.documentNo = numEl.value.trim();
  }

  currentFileData.categoryId = currentCategory;
  const gstEl = getFieldElement('gstRate');
  if (gstEl) currentFileData.gstRate = parseFloat(gstEl.value) || 0;
}

// ─── SAVE ──────────────────────────────────────────────────────
// IMPORTANT: scheduleSave/collectItemsAndSave NEVER create a new document.
// They only persist edits to an already-loaded currentFileData. Document
// creation happens exclusively through createNewFile(), triggered by an
// explicit "+ New" action. If no document is currently loaded, edits are
// simply not autosaved (there is nothing to save into) — this prevents the
// "opening a page silently creates a blank document" bug.
function scheduleSave() {
  if (!currentFileData) return;
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    collectItemsAndSave();
  }, 300);
}

function collectItemsAndSave() {
  if (currentRole !== 'admin') return;
  if (!currentFileData) return; // never fabricate a document implicitly

  // Guard against resurrecting a document that was deleted elsewhere (e.g.
  // via the sidebar delete button, or a bulk operation) while it was still
  // the "open" document in the editor. Without this check, the next
  // autosave would silently re-insert the deleted document via the
  // upsert-by-id logic in saveInvoice/saveQuotation.
  const store = currentDocType === 'invoice' ? appData.invoices : appData.quotations;
  const stillExists = !currentFileData.id || store.some(d => d.id === currentFileData.id);
  if (!stillExists) {
    currentFileData = null;
    currentDocId = null;
    return;
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

  const descEl =
    document.getElementById(prefix + 'newItemDesc') ||
    document.getElementById('newItemDesc');

  const hsnEl =
    document.getElementById(prefix + 'newItemHsn') ||
    document.getElementById('newItemHsn');

  const qtyEl =
    document.getElementById(prefix + 'newItemQty') ||
    document.getElementById('newItemQty');

  const priceEl =
    document.getElementById(prefix + 'newItemPrice') ||
    document.getElementById('newItemPrice');

  const desc = descEl ? descEl.value.trim() : '';
  const hsn = hsnEl ? hsnEl.value.trim() : '';

  const qtyValue = qtyEl ? parseFloat(qtyEl.value) : 1;
  const priceValue = priceEl ? parseFloat(priceEl.value) : 0;

  const qty = Number.isFinite(qtyValue) && qtyValue > 0 ? qtyValue : 1;
  const price = Number.isFinite(priceValue) && priceValue >= 0 ? priceValue : 0;

  if (!desc) {
    toast('Please enter item description', 'error');
    return;
  }

  // A real document must already exist before adding an item.
  // Normally this comes from + New File.
  if (!currentFileData) {
    toast('Please create or open a document first.', 'error');
    return;
  }

  if (!Array.isArray(currentFileData.items)) {
    currentFileData.items = [];
  }

  // Add directly to the document data.
  currentFileData.items.push({
    description: desc,
    hsn: hsn,
    qty: qty,
    unitPrice: price
  });

  // Persist THIS document directly.
  if (currentDocType === 'invoice') {
    saveInvoice(currentFileData);
  } else {
    saveQuotation(currentFileData);
  }

  currentDocId = currentFileData.id;

  // Now render the newly saved item.
  renderFileToUI(currentFileData);

  // Update totals/dashboard/sidebar.
  updateTotals();
  renderMonthlyFilesList();
  updateDashboard();

  // Clear add-item inputs.
  if (descEl) descEl.value = '';
  if (hsnEl) hsnEl.value = '';
  if (qtyEl) qtyEl.value = '1';
  if (priceEl) priceEl.value = '0';

  toast('Item added', 'success');
}

// ─── SORTABLE ──────────────────────────────────────────────────
function initSortable() {
  if (typeof Sortable === 'undefined') {
    console.warn('SortableJS failed to load (offline/CDN blocked) — drag-to-reorder disabled, all other item actions still work.');
    return;
  }
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

  // Load the latest document for the category.
  // If the category is empty, show an empty state.
  // NEVER create a document just because the category was opened.

  const store = getActiveStore();
  const categoryDocs = store.filter(d => d.categoryId === catId);

  if (categoryDocs.length > 0) {
    loadActiveDocument(categoryDocs[categoryDocs.length - 1].id);
  } else {
    currentFileData = null;
    currentDocId = null;

    renderFileToUI(null);
    renderMonthlyFilesList();
    updatePageTitle();
    updateDashboard();
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
  const previousType = currentDocType;

  // Save the current document before changing type,
  // but only if we are actually leaving the current type.
  if (type !== previousType) {
    collectItemsAndSave();
  }

  currentDocType = type;

  // Clear the active document first so we never accidentally
  // display a quotation while entering invoices, or vice versa.
  currentFileData = null;
  currentDocId = null;

  const store = getActiveStore();
  const categoryDocs = store.filter(
    d => d.categoryId === currentCategory
  );

  if (categoryDocs.length > 0) {
    const latestDoc = categoryDocs[categoryDocs.length - 1];
    loadActiveDocument(latestDoc.id);
  } else {
    // IMPORTANT:
    // Opening a document type must NOT create a document.
    renderFileToUI(null);
    renderMonthlyFilesList();
    updatePageTitle();
    updateDashboard();
  }

  // Always navigate, even when clicking the already-selected tab.
  navigate('docpage');

  // Ensure correct page is visible.
  const targetPage = document.getElementById(
    'page-' + currentDocType
  );

  if (targetPage) {
    document.querySelectorAll('.page').forEach(page => {
      page.classList.remove('active');
    });

    targetPage.classList.add('active');
  }

  renderMonthlyFilesList();
  updatePageTitle();

  toast(
    'Opened ' +
    (type === 'quotation' ? 'Quotations' : 'Invoices'),
    'info'
  );
}

function createNewFile(selectedDate = null, docType = null, categoryId = null) {
  if (!requireAdmin('create file')) return;
  collectItemsAndSave();

  // Determine document type
  const type = docType || currentDocType || 'quotation';
  // Determine category
  const cat = categoryId || currentCategory || CATEGORIES[0].id;

  // Determine date
  let dateObj = selectedDate ? parseLocalDate(selectedDate) : new Date();
  if (isNaN(dateObj.getTime())) dateObj = new Date();
  const dateStr = formatLocalDate(dateObj);

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
    const today = formatLocalDate(new Date());
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
  if (!currentFileData) {
    toast('No document open — click "+ New" to create one first', 'error');
    return;
  }
  collectItemsAndSave();
  toast('File saved successfully', 'success');
}

function deleteCurrentFile() {
  if (!requireAdmin('delete')) return;
  if (!currentDocId) return;
  if (!confirm(`Delete active ${currentDocType}?`)) return;

  if (currentDocType === 'invoice') {
    const proceeded = deleteInvoice(currentDocId);
    if (proceeded === false) return; // user cancelled the payment-unlink confirm
  } else {
    deleteQuotation(currentDocId);
  }

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
  if (typeof html2pdf === 'undefined') {
    toast('PDF library failed to load — check your internet connection and try again', 'error');
    return;
  }
  collectItemsAndSave();
  const element = currentDocType === 'quotation'
    ? document.getElementById('quotationCard')
    : document.getElementById('invoiceCard');

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

      // ─── VALIDATION ───────────────────────────────────────────
      // Reject malformed data safely rather than blindly replacing the
      // dataset. Checks structural shape (arrays where arrays are expected)
      // and referential integrity (every customerId/invoiceId/quotationId
      // reference actually resolves within the imported data) before ever
      // touching localStorage.
      const requiredArrayKeys = ['customers', 'quotations', 'invoices', 'payments'];
      for (const key of requiredArrayKeys) {
        if (imported[key] !== undefined && !Array.isArray(imported[key])) {
          toast(`Import rejected: "${key}" is not a valid list.`, 'error');
          return;
        }
      }
      if (!Array.isArray(imported.quotations) && !Array.isArray(imported.invoices)) {
        toast('Import rejected: file does not look like a Defence ELV Systems backup.', 'error');
        return;
      }

      const customerIds = new Set((imported.customers || []).map(c => c.id).filter(Boolean));
      const quotationIds = new Set((imported.quotations || []).map(q => q.id).filter(Boolean));
      const invoiceIds = new Set((imported.invoices || []).map(i => i.id).filter(Boolean));

      const brokenRefs = [];
      (imported.quotations || []).forEach(q => {
        if (q.customerId && !customerIds.has(q.customerId)) brokenRefs.push(`Quotation ${q.documentNo || q.id} references missing customer ${q.customerId}`);
      });
      (imported.invoices || []).forEach(inv => {
        if (inv.customerId && !customerIds.has(inv.customerId)) brokenRefs.push(`Invoice ${inv.documentNo || inv.id} references missing customer ${inv.customerId}`);
        if (inv.quotationId && !quotationIds.has(inv.quotationId)) brokenRefs.push(`Invoice ${inv.documentNo || inv.id} references missing quotation ${inv.quotationId}`);
      });
      (imported.payments || []).forEach(p => {
        if (p.customerId && !customerIds.has(p.customerId)) brokenRefs.push(`Payment ${p.paymentNo || p.id} references missing customer ${p.customerId}`);
        if (p.invoiceId && !invoiceIds.has(p.invoiceId)) brokenRefs.push(`Payment ${p.paymentNo || p.id} references missing invoice ${p.invoiceId}`);
      });

      if (brokenRefs.length > 0) {
        const proceed = confirm(
          `This backup has ${brokenRefs.length} broken reference(s), e.g.:\n` +
          brokenRefs.slice(0, 3).join('\n') +
          `\n\nImporting anyway may leave some documents unlinked from their customer. Continue?`
        );
        if (!proceed) { toast('Import cancelled', 'info'); return; }
      }

      // ─── BACKUP BEFORE DESTRUCTIVE IMPORT ──────────────────────
      try {
        const backupKey = STORAGE_KEY + '_pre_import_backup_' + Date.now();
        localStorage.setItem(backupKey, JSON.stringify(appData));
      } catch (backupErr) {
        const proceedWithoutBackup = confirm('Could not create a safety backup (storage full?). Import anyway?');
        if (!proceedWithoutBackup) { toast('Import cancelled', 'info'); return; }
      }

      const migrated = migrateData(imported);
      appData = migrated;
      saveData(appData);
      currentFileData = null;
      currentDocId = null;
      loadActiveDocument();
      renderCategories();
      updateDashboard();
      toast('Data imported successfully! A backup of your previous data was saved.', 'success');
    } catch (err) {
      toast('Failed to import data: ' + err.message, 'error');
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

// ─── SETTINGS MODAL ─────────────────────────────────────────────
function openSettingsModal() {
  const overlay = document.getElementById('settingsModalOverlay');
  if (overlay) overlay.classList.add('open');
}

function closeSettingsModal() {
  const overlay = document.getElementById('settingsModalOverlay');
  if (overlay) overlay.classList.remove('open');
}

// ─── PASSWORD CHANGE MODAL ───────────────────────────────────────
function openPasswordModal() {
  if (!requireAdmin('change password')) return;
  const overlay = document.getElementById('passwordModalOverlay');
  if (!overlay) return;
  ['pwdCurrent', 'pwdNew', 'pwdConfirm'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const errorEl = document.getElementById('pwdError');
  if (errorEl) errorEl.classList.remove('show');
  const successEl = document.getElementById('pwdSuccess');
  if (successEl) successEl.classList.remove('show');
  overlay.classList.add('open');
}

function closePasswordModal() {
  const overlay = document.getElementById('passwordModalOverlay');
  if (overlay) overlay.classList.remove('open');
}

function changePassword() {
  if (!requireAdmin('change password')) return;
  const current = document.getElementById('pwdCurrent')?.value || '';
  const next = document.getElementById('pwdNew')?.value || '';
  const confirmVal = document.getElementById('pwdConfirm')?.value || '';
  const errorEl = document.getElementById('pwdError');
  const successEl = document.getElementById('pwdSuccess');

  const savedPassword = appData?.settings?.adminPassword || 'admin123';

  const showError = (msg) => {
    if (errorEl) { errorEl.textContent = msg; errorEl.classList.add('show'); }
    if (successEl) successEl.classList.remove('show');
  };

  if (current !== savedPassword) {
    showError('Current password is incorrect.');
    return;
  }
  if (next.length < 4) {
    showError('New password must be at least 4 characters.');
    return;
  }
  if (next !== confirmVal) {
    showError('New password and confirmation do not match.');
    return;
  }

  appData.settings.adminPassword = next;
  saveData();

  if (errorEl) errorEl.classList.remove('show');
  if (successEl) successEl.classList.add('show');
  toast('Password changed successfully', 'success');

  setTimeout(() => {
    closePasswordModal();
  }, 1200);
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
  } else if (pageId === 'payments') {
    targetPage = document.getElementById('page-payments');
    if (targetPage) renderPayments();
  } else if (pageId === 'ledger') {
    targetPage = document.getElementById('page-ledger');
    if (targetPage) renderLedger();
  } else if (pageId === 'statement') {
    targetPage = document.getElementById('page-statement');
    if (targetPage) populateStatementCustomerSelect();
  } else if (pageId === 'gst') {
    targetPage = document.getElementById('page-gst');
    if (targetPage) renderGstDashboard();
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
} else if (pageId === 'payments') {
  const t = document.getElementById('sidebarPaymentsTab');
  if (t) t.classList.add('active');
} else if (pageId === 'ledger') {
  const t = document.getElementById('sidebarLedgerTab');
  if (t) t.classList.add('active');
} else if (pageId === 'statement') {
  const t = document.getElementById('sidebarStatementTab');
  if (t) t.classList.add('active');
} else if (pageId === 'gst') {
  const t = document.getElementById('sidebarGstTab');
  if (t) t.classList.add('active');
} else if (pageId === 'quotation' || pageId === 'invoice' || pageId === 'docpage') {
  // Highlight the tab matching currentDocType
  const tabId = currentDocType === 'quotation' ? 'sidebarQuotationsTab' : 'sidebarInvoicesTab';
  const tab = document.getElementById(tabId);
  if (tab) tab.classList.add('active');
}

  // Update page title
  const pageTitleEl = document.getElementById('pageTitle');
  const titleMap = { customers: 'Customers', payments: 'Payments', ledger: 'Customer Ledger', statement: 'Statement of Account', gst: 'GST Dashboard' };
  if (pageTitleEl) {
    if (pageId === 'dashboard') {
      pageTitleEl.textContent = 'Dashboard';
    } else if (titleMap[pageId]) {
      pageTitleEl.textContent = titleMap[pageId];
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

// ─── LOGOUT (duplicate removed — see canonical logout() above which
// correctly clears LOGIN_STORAGE_KEY) ──────────────────────────

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

  // Admin / Viewer selection
  document.querySelectorAll('.role-badge').forEach(badge => {
    badge.addEventListener('click', function() {

      document.querySelectorAll('.role-badge').forEach(item => {
        item.classList.remove('active');
      });

      this.classList.add('active');

      const selectedRole = this.dataset.role;

      const passwordField =
        document.getElementById('passwordField');

      const passwordInput =
        document.getElementById('loginPassword');

      const errorEl =
        document.getElementById('loginError');

      if (selectedRole === 'admin') {
        if (passwordField) {
          passwordField.classList.add('show');
        }

        if (passwordInput) {
          passwordInput.focus();
        }

      } else {
        if (passwordField) {
          passwordField.classList.remove('show');
        }
      }

      if (passwordInput) {
        passwordInput.value = '';
      }

      if (errorEl) {
        errorEl.classList.remove('show');
      }
    });
  });

  // Password field Enter key
  const loginPassword = document.getElementById('loginPassword');

  if (loginPassword) {
    loginPassword.addEventListener('keydown', function(e) {

      if (e.key === 'Enter') {
        e.preventDefault();
        handleLogin();
      }

    });

    setTimeout(() => {
      loginPassword.focus();
    }, 300);
  }

  // Logout button
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', logout);

  // ─── CHECK SESSION ─────────────────────────────────────────────

  const savedSession =
    localStorage.getItem(LOGIN_STORAGE_KEY);

  if (
    savedSession === 'logged_in_admin' ||
    savedSession === 'logged_in'
  ) {

    isLoggedIn = true;
    setRole('admin');
    hideLogin();

    renderCategories();
    loadActiveDocument();
    navigate('dashboard');
    updateDashboard();

    console.log('✅ Admin session restored');

  } else if (savedSession === 'logged_in_viewer') {

    isLoggedIn = true;
    setRole('viewer');
    hideLogin();

    renderCategories();
    loadActiveDocument();
    navigate('dashboard');
    updateDashboard();

    console.log('✅ Viewer session restored');

  } else {

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

    const card = document.getElementById(prefix === 'q_' ? 'quotationCard' : 'invoiceCard');
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

// Close Settings / Password modals on overlay click
const settingsOverlay = document.getElementById('settingsModalOverlay');
if (settingsOverlay) {
  settingsOverlay.addEventListener('click', function(e) {
    if (e.target === this) closeSettingsModal();
  });
}
const passwordOverlay = document.getElementById('passwordModalOverlay');
if (passwordOverlay) {
  passwordOverlay.addEventListener('click', function(e) {
    if (e.target === this) closePasswordModal();
  });
}

// Payment modal wiring
const paymentOverlay = document.getElementById('paymentModalOverlay');
if (paymentOverlay) {
  paymentOverlay.addEventListener('click', function(e) {
    if (e.target === this) closePaymentModal();
  });
}
const paymentForm = document.getElementById('paymentForm');
if (paymentForm) paymentForm.addEventListener('submit', savePaymentForm);

// Payments page filters
const paymentsSearch = document.getElementById('paymentsSearch');
if (paymentsSearch) paymentsSearch.addEventListener('input', () => renderPayments());
const paymentsCustomerFilter = document.getElementById('paymentsCustomerFilter');
if (paymentsCustomerFilter) paymentsCustomerFilter.addEventListener('change', () => renderPayments());
const addPaymentBtn = document.getElementById('addPaymentBtn');
if (addPaymentBtn) addPaymentBtn.addEventListener('click', () => openPaymentModal());

// Ledger page
const ledgerCustomerSelect = document.getElementById('ledgerCustomerSelect');
if (ledgerCustomerSelect) ledgerCustomerSelect.addEventListener('change', () => renderLedger());

// Statement of account page
const statementCustomerSelect = document.getElementById('statementCustomerSelect');
if (statementCustomerSelect) statementCustomerSelect.addEventListener('change', () => renderStatement());
const statementFrom = document.getElementById('statementFrom');
if (statementFrom) statementFrom.addEventListener('change', () => renderStatement());
const statementTo = document.getElementById('statementTo');
if (statementTo) statementTo.addEventListener('change', () => renderStatement());
const statementPrintBtn = document.getElementById('statementPrintBtn');
if (statementPrintBtn) statementPrintBtn.addEventListener('click', () => printStatement());

// Sidebar nav: new pages
const paymentsTab = document.getElementById('sidebarPaymentsTab');
if (paymentsTab) paymentsTab.addEventListener('click', () => navigate('payments'));
const ledgerTab = document.getElementById('sidebarLedgerTab');
if (ledgerTab) ledgerTab.addEventListener('click', () => navigate('ledger'));
const statementTab = document.getElementById('sidebarStatementTab');
if (statementTab) statementTab.addEventListener('click', () => navigate('statement'));
const gstTab = document.getElementById('sidebarGstTab');
if (gstTab) gstTab.addEventListener('click', () => navigate('gst'));

// Global search
const globalSearchInput = document.getElementById('globalSearchInput');
if (globalSearchInput) {
  globalSearchInput.addEventListener('input', function() {
    renderGlobalSearchResults(this.value);
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