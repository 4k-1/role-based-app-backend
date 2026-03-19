// ============================================
// GLOBAL STATE & CONFIGURATION
// ============================================

let currentUser = null;
const API_BASE = 'http://localhost:3000/api';

// ============================================
// AUTH HELPERS
// ============================================

function getAuthHeader() {
  const token = sessionStorage.getItem('authToken');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

async function apiFetch(endpoint, options = {}) {
  const defaultHeaders = {
    'Content-Type': 'application/json',
    ...getAuthHeader()
  };

  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: { ...defaultHeaders, ...(options.headers || {}) }
    });
    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    console.error('API Error:', err);
    return { ok: false, status: 0, data: { error: 'Network error. Is the backend running?' } };
  }
}

// ============================================
// TOAST NOTIFICATIONS
// ============================================

function showToast(message, type = 'info') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => toast.remove(), 4000);
}

// ============================================
// AUTH STATE MANAGEMENT
// ============================================

function setAuthState(isAuth, user = null) {
  currentUser = user;
  const body = document.body;

  if (isAuth && user) {
    body.classList.remove('not-authenticated');
    body.classList.add('authenticated');

    if (user.role === 'admin') {
      body.classList.add('is-admin');
    } else {
      body.classList.remove('is-admin');
    }

    // Show username in navbar dropdown (PDF uses username not firstName/lastName)
    const userDropdown = document.getElementById('userDropdown');
    if (userDropdown) {
      userDropdown.textContent = user.username;
    }
  } else {
    body.classList.add('not-authenticated');
    body.classList.remove('authenticated', 'is-admin');
    currentUser = null;
  }
}

async function restoreAuthState() {
  const token = sessionStorage.getItem('authToken');
  if (!token) return false;

  // Call /api/profile to validate token and get user info
  const { ok, data } = await apiFetch('/profile');
  if (ok && data.user) {
    setAuthState(true, data.user);
    return true;
  } else {
    sessionStorage.removeItem('authToken');
    return false;
  }
}

// ============================================
// ROUTING
// ============================================

function navigateTo(hash) {
  window.location.hash = hash;
}

function handleRouting() {
  const hash = window.location.hash.slice(1) || '/';
  const [route] = hash.split('/').filter(Boolean);
  const pageName = route ? `${route}-page` : 'home-page';

  // Hide all pages
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

  const protectedRoutes = ['profile', 'requests', 'accounts', 'employees', 'departments'];
  const adminRoutes = ['accounts', 'employees', 'departments'];

  if (protectedRoutes.includes(route) && !currentUser) {
    navigateTo('#/login');
    showToast('Please log in first', 'info');
    return;
  }

  if (adminRoutes.includes(route) && (!currentUser || currentUser.role !== 'admin')) {
    navigateTo('#/');
    showToast('Admin access required', 'error');
    return;
  }

  const page = document.getElementById(pageName);
  if (page) {
    page.classList.add('active');

    if (route === 'profile') renderProfile();
    else if (route === 'accounts') renderAccountsList();
    else if (route === 'employees') renderEmployeesTable();
    else if (route === 'departments') renderDepartmentsList();
    else if (route === 'requests') renderRequestsList();
  } else if (route !== '') {
    navigateTo('#/');
  }
}

window.addEventListener('hashchange', handleRouting);

// ============================================
// INIT
// ============================================

document.addEventListener('DOMContentLoaded', async function () {
  const registerForm = document.getElementById('registerForm');
  const loginForm = document.getElementById('loginForm');
  const logoutBtn = document.getElementById('logoutBtn');
  const newRequestBtn = document.getElementById('newRequestBtn');
  const addItemBtn = document.getElementById('addItemBtn');

  // Restore session on load
  await restoreAuthState();

  if (!window.location.hash) {
    window.location.hash = '#/';
  } else {
    handleRouting();
  }

  // ========== REGISTRATION ==========
  // PDF server uses username + password only
  if (registerForm) {
    registerForm.addEventListener('submit', async function (e) {
      e.preventDefault();

      const username = document.getElementById('regFirst').value.trim(); // using first name field as username
      const password = document.getElementById('regPassword').value;

      if (!username || !password) {
        showToast('Username and password are required', 'error');
        return;
      }

      if (password.length < 6) {
        showToast('Password must be at least 6 characters', 'error');
        return;
      }

      const { ok, data } = await apiFetch('/register', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });

      if (ok) {
        showToast('Registration successful! You can now log in.', 'success');
        navigateTo('#/login');
        registerForm.reset();
      } else {
        showToast(data.error || 'Registration failed', 'error');
      }
    });
  }

  // ========== LOGIN ==========
  // PDF server uses username + password (not email)
  if (loginForm) {
    loginForm.addEventListener('submit', async function (e) {
      e.preventDefault();

      // Using email field as username input (no change to HTML needed)
      const username = document.getElementById('loginEmail').value.trim();
      const password = document.getElementById('loginPassword').value;
      const loginError = document.getElementById('loginError');

      const { ok, data } = await apiFetch('/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });

      if (ok) {
        // Save token in sessionStorage
        sessionStorage.setItem('authToken', data.token);
        setAuthState(true, data.user);
        showToast(`Welcome back, ${data.user.username}!`, 'success');
        navigateTo('#/profile');
        loginForm.reset();
        if (loginError) loginError.textContent = '';
      } else {
        if (loginError) loginError.textContent = data.error || 'Login failed';
        showToast(data.error || 'Login failed', 'error');
      }
    });
  }

  // ========== LOGOUT ==========
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function (e) {
      e.preventDefault();
      sessionStorage.removeItem('authToken');
      setAuthState(false);
      showToast('You have been logged out', 'info');
      navigateTo('#/');
    });
  }

  // ========== NEW REQUEST BUTTON ==========
  if (newRequestBtn) {
    newRequestBtn.addEventListener('click', function () {
      const requestModal = new bootstrap.Modal(document.getElementById('requestModal'));
      requestModal.show();
    });
  }

  // ========== ADD ITEM TO REQUEST ==========
  if (addItemBtn) {
    addItemBtn.addEventListener('click', function () {
      const itemsList = document.getElementById('itemsList');
      const newRow = document.createElement('div');
      newRow.className = 'input-group mb-2 item-row';
      newRow.innerHTML = `
        <input type="text" class="form-control" placeholder="Item Name" required>
        <input type="number" class="form-control" placeholder="Qty" min="1" value="1" required>
        <button type="button" class="btn btn-danger remove-item">×</button>
      `;
      newRow.querySelector('.remove-item').addEventListener('click', function () {
        newRow.remove();
        updateItemRemoveButtons();
      });
      itemsList.appendChild(newRow);
      updateItemRemoveButtons();
    });
  }

  // Handle item removal (delegated)
  document.addEventListener('click', function (e) {
    if (e.target.classList.contains('remove-item')) {
      e.target.closest('.item-row').remove();
      updateItemRemoveButtons();
    }
  });

  // ========== REQUEST FORM SUBMIT ==========
  const requestForm = document.getElementById('requestForm');
  if (requestForm) {
    requestForm.addEventListener('submit', async function (e) {
      e.preventDefault();

      const type = document.getElementById('requestType').value;
      const itemRows = document.querySelectorAll('#itemsList .item-row');
      const items = [];

      itemRows.forEach(row => {
        const name = row.querySelector('input[type="text"]').value.trim();
        const qty = parseInt(row.querySelector('input[type="number"]').value);
        if (name) items.push({ name, qty });
      });

      if (items.length === 0) {
        showToast('Please add at least one item', 'error');
        return;
      }

      const { ok, data } = await apiFetch('/requests', {
        method: 'POST',
        body: JSON.stringify({ type, items })
      });

      if (ok) {
        showToast('Request submitted successfully!', 'success');
        const modal = bootstrap.Modal.getInstance(document.getElementById('requestModal'));
        modal.hide();
        requestForm.reset();
        document.getElementById('itemsList').innerHTML = `
          <div class="input-group mb-2 item-row">
            <input type="text" class="form-control" placeholder="Item Name" required>
            <input type="number" class="form-control" placeholder="Qty" min="1" value="1" required>
            <button type="button" class="btn btn-danger remove-item" style="display:none;">×</button>
          </div>
        `;
        if (document.getElementById('requestsList')) renderRequestsList();
      } else {
        showToast(data.error || 'Failed to submit request', 'error');
      }
    });
  }

  // ========== ACCOUNT MODAL FORM ==========
  const accountForm = document.getElementById('accountForm');
  if (accountForm) {
    accountForm.addEventListener('submit', async function (e) {
      e.preventDefault();

      const firstName = document.getElementById('modalFirstName').value.trim();
      const lastName = document.getElementById('modalLastName').value.trim();
      const email = document.getElementById('modalEmail').value.trim().toLowerCase();
      const password = document.getElementById('modalPassword').value;
      const role = document.getElementById('modalRole').value;
      const verified = document.getElementById('modalVerified').checked;
      const editingId = accountForm.dataset.editingId;

      let result;
      if (editingId) {
        result = await apiFetch(`/accounts/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify({ firstName, lastName, email, password: password || undefined, role, verified })
        });
      } else {
        if (!password) {
          showToast('Password is required for new accounts', 'error');
          return;
        }
        result = await apiFetch('/accounts', {
          method: 'POST',
          body: JSON.stringify({ firstName, lastName, email, password, role, verified })
        });
      }

      if (result.ok) {
        showToast('Account saved successfully!', 'success');
        const modal = bootstrap.Modal.getInstance(document.getElementById('accountModal'));
        modal.hide();
        accountForm.reset();
        delete accountForm.dataset.editingId;
        document.getElementById('accountModalLabel').textContent = 'Add/Edit Account';
        document.getElementById('modalPassword').required = true;
        renderAccountsList();
      } else {
        showToast(result.data.error || 'Failed to save account', 'error');
      }
    });
  }

  // ========== EMPLOYEE MODAL FORM ==========
  const employeeForm = document.getElementById('employeeForm');
  if (employeeForm) {
    employeeForm.addEventListener('submit', async function (e) {
      e.preventDefault();

      const empId = document.getElementById('modalEmployeeId').value.trim();
      const empEmail = document.getElementById('modalEmployeeEmail').value.trim().toLowerCase();
      const position = document.getElementById('modalPosition').value.trim();
      const deptId = document.getElementById('modalDepartment').value;
      const hireDate = document.getElementById('modalHireDate').value;
      const editingId = employeeForm.dataset.editingId;

      let result;
      if (editingId) {
        result = await apiFetch(`/employees/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify({ employeeId: empId, userEmail: empEmail, position, departmentId: deptId, hireDate })
        });
      } else {
        result = await apiFetch('/employees', {
          method: 'POST',
          body: JSON.stringify({ employeeId: empId, userEmail: empEmail, position, departmentId: deptId, hireDate })
        });
      }

      if (result.ok) {
        showToast('Employee saved successfully!', 'success');
        const modal = bootstrap.Modal.getInstance(document.getElementById('employeeModal'));
        modal.hide();
        employeeForm.reset();
        delete employeeForm.dataset.editingId;
        document.getElementById('employeeModalLabel').textContent = 'Add/Edit Employee';
        renderEmployeesTable();
      } else {
        showToast(result.data.error || 'Failed to save employee', 'error');
      }
    });
  }

  // ========== DEPARTMENT MODAL FORM ==========
  const departmentForm = document.getElementById('departmentForm');
  if (departmentForm) {
    departmentForm.addEventListener('submit', async function (e) {
      e.preventDefault();

      const deptName = document.getElementById('modalDepartmentName').value.trim();
      const deptDesc = document.getElementById('modalDepartmentDesc').value.trim();
      const editingId = departmentForm.dataset.editingId;

      let result;
      if (editingId) {
        result = await apiFetch(`/departments/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify({ name: deptName, description: deptDesc })
        });
      } else {
        result = await apiFetch('/departments', {
          method: 'POST',
          body: JSON.stringify({ name: deptName, description: deptDesc })
        });
      }

      if (result.ok) {
        showToast('Department saved successfully!', 'success');
        const modal = bootstrap.Modal.getInstance(document.getElementById('departmentModal'));
        modal.hide();
        departmentForm.reset();
        delete departmentForm.dataset.editingId;
        document.getElementById('departmentModalLabel').textContent = 'Add/Edit Department';
        renderDepartmentsList();
      } else {
        showToast(result.data.error || 'Failed to save department', 'error');
      }
    });
  }
});

// ============================================
// RENDERING FUNCTIONS
// ============================================

async function renderProfile() {
  const profileContent = document.getElementById('profileContent');
  if (!profileContent || !currentUser) return;

  // Call /api/profile to get fresh user data from server
  const { ok, data } = await apiFetch('/profile');
  const user = ok ? data.user : currentUser;

  profileContent.innerHTML = `
    <div class="profile-header">
      <div class="avatar-circle">${user.username.charAt(0).toUpperCase()}</div>
      <div class="profile-info">
        <h3>${user.username}</h3>
        <span class="profile-role">${user.role === 'admin' ? 'Administrator' : 'User'}</span>
      </div>
    </div>
    <div class="profile-fields">
      <div class="profile-field">
        <div class="profile-field-icon"><i class="fas fa-user"></i></div>
        <div class="profile-field-content">
          <div class="profile-field-label">Username</div>
          <div class="profile-field-value">${user.username}</div>
        </div>
      </div>
      <div class="profile-field">
        <div class="profile-field-icon"><i class="fas fa-crown"></i></div>
        <div class="profile-field-content">
          <div class="profile-field-label">Account Role</div>
          <div class="profile-field-value">${user.role === 'admin' ? 'Administrator' : 'User'}</div>
        </div>
      </div>
    </div>
  `;
}

async function renderAccountsList() {
  const accountsTable = document.getElementById('accountsTable');
  if (!accountsTable) return;

  const { ok, data } = await apiFetch('/accounts');

  if (!ok) {
    accountsTable.innerHTML = `<p class="text-danger">${data.error || 'Failed to load accounts'}</p>`;
    return;
  }

  const accounts = data;
  let html = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
      <div></div>
      <button class="btn btn-primary" style="background-color: #0052cc;" onclick="openAccountModal()">
        <i class="fas fa-plus"></i> Add Account
      </button>
    </div>
    <div class="table-responsive">
      <table class="table">
        <thead>
          <tr>
            <th>NAME</th><th>EMAIL</th><th>ROLE</th><th>VERIFIED</th><th>ACTIONS</th>
          </tr>
        </thead>
        <tbody>
  `;

  if (accounts.length === 0) {
    html += `<tr><td colspan="5" class="text-center text-muted py-4">No accounts found.</td></tr>`;
  } else {
    accounts.forEach(account => {
      const verified = account.verified
        ? '<i class="fas fa-check" style="color:#28a745;"></i>'
        : '<i class="fas fa-times" style="color:#dc3545;"></i>';
      const roleBadge = `<span style="background-color:#e8d5f2;color:#800080;padding:0.35rem 0.75rem;border-radius:4px;font-size:0.85rem;font-weight:600;">${account.role}</span>`;
      html += `
        <tr>
          <td>${account.firstName} ${account.lastName}</td>
          <td>${account.email}</td>
          <td>${roleBadge}</td>
          <td>${verified}</td>
          <td>
            <button class="btn btn-link" onclick="openAccountModal(${account.id})" title="Edit">
              <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#5985E1"><path d="m490-527 37 37 217-217-37-37-217 217ZM200-200h37l233-233-37-37-233 233v37Zm355-205L405-555l167-167-29-29-219 219-56-56 218-219q24-24 56.5-24t56.5 24l29 29 50-50q12-12 28.5-12t28.5 12l93 93q12 12 12 28.5T828-678L555-405ZM270-120H120v-150l285-285 150 150-285 285Z"/></svg>
            </button>
            <button class="btn btn-link" onclick="resetPassword(${account.id}, '${account.email}')" title="Reset Password">
              <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#EAC452"><path d="M443.5-736.5Q467-760 500-760t56.5 23.5Q580-713 580-680t-23.5 56.5Q533-600 500-600t-56.5-23.5Q420-647 420-680t23.5-56.5ZM500 0 320-180l60-80-60-80 60-85v-47q-54-32-87-86.5T260-680q0-100 70-170t170-70q100 0 170 70t70 170q0 67-33 121.5T620-472v352L500 0ZM340-680q0 56 34 98.5t86 56.5v125l-41 58 61 82-55 71 75 75 40-40v-371q52-14 86-56.5t34-98.5q0-66-47-113t-113-47q-66 0-113 47t-47 113Z"/></svg>
            </button>
            <button class="btn btn-link" onclick="deleteAccount(${account.id}, '${account.email}')" title="Delete">
              <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#992B15"><path d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z"/></svg>
            </button>
          </td>
        </tr>
      `;
    });
  }

  html += `</tbody></table></div>`;
  accountsTable.innerHTML = html;
}

async function renderEmployeesTable() {
  const employeesTable = document.getElementById('employeesTable');
  if (!employeesTable) return;

  const [empResult, deptResult] = await Promise.all([
    apiFetch('/employees'),
    apiFetch('/departments')
  ]);

  if (!empResult.ok) {
    employeesTable.innerHTML = `<p class="text-danger">${empResult.data.error || 'Failed to load employees'}</p>`;
    return;
  }

  const employees = empResult.data;
  const departments = deptResult.ok ? deptResult.data : [];

  let html = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
      <div></div>
      <button class="btn btn-primary" style="background-color: #0052cc;" onclick="openEmployeeModal()">
        <i class="fas fa-plus"></i> Add Employee
      </button>
    </div>
    <div class="table-responsive">
      <table class="table">
        <thead>
          <tr>
            <th>EMPLOYEE ID</th><th>EMAIL</th><th>POSITION</th><th>DEPARTMENT</th><th>ACTIONS</th>
          </tr>
        </thead>
        <tbody>
  `;

  if (employees.length === 0) {
    html += `<tr><td colspan="5" class="text-center text-muted py-4">No employees found.</td></tr>`;
  } else {
    employees.forEach(emp => {
      const dept = departments.find(d => d.id === emp.departmentId);
      const deptName = dept ? dept.name : 'N/A';
      html += `
        <tr>
          <td>${emp.employeeId}</td>
          <td>${emp.userEmail}</td>
          <td>${emp.position}</td>
          <td>${deptName}</td>
          <td>
            <button class="btn btn-link" onclick="openEmployeeModal('${emp.id}')" title="Edit">
              <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#5985E1"><path d="m490-527 37 37 217-217-37-37-217 217ZM200-200h37l233-233-37-37-233 233v37Zm355-205L405-555l167-167-29-29-219 219-56-56 218-219q24-24 56.5-24t56.5 24l29 29 50-50q12-12 28.5-12t28.5 12l93 93q12 12 12 28.5T828-678L555-405ZM270-120H120v-150l285-285 150 150-285 285Z"/></svg>
            </button>
            <button class="btn btn-link" onclick="deleteEmployee('${emp.id}')" title="Delete">
              <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#992B15"><path d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z"/></svg>
            </button>
          </td>
        </tr>
      `;
    });
  }

  html += `</tbody></table></div>`;
  employeesTable.innerHTML = html;
}

async function renderDepartmentsList() {
  const departmentsList = document.getElementById('departmentsList');
  if (!departmentsList) return;

  const { ok, data } = await apiFetch('/departments');

  if (!ok) {
    departmentsList.innerHTML = `<p class="text-danger">${data.error || 'Failed to load departments'}</p>`;
    return;
  }

  const departments = data;
  let html = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
      <div></div>
      <button class="btn btn-primary" style="background-color: #0052cc;" onclick="openDepartmentModal()">
        <i class="fas fa-plus"></i> Add Department
      </button>
    </div>
    <div class="table-responsive">
      <table class="table">
        <thead>
          <tr><th>NAME</th><th>DESCRIPTION</th><th>ACTIONS</th></tr>
        </thead>
        <tbody>
  `;

  if (departments.length === 0) {
    html += `<tr><td colspan="3" class="text-center text-muted py-4">No departments found.</td></tr>`;
  } else {
    departments.forEach(dept => {
      html += `
        <tr>
          <td>${dept.name}</td>
          <td>${dept.description}</td>
          <td>
            <button class="btn btn-link" onclick="openDepartmentModal('${dept.id}')" title="Edit">
              <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#5985E1"><path d="m490-527 37 37 217-217-37-37-217 217ZM200-200h37l233-233-37-37-233 233v37Zm355-205L405-555l167-167-29-29-219 219-56-56 218-219q24-24 56.5-24t56.5 24l29 29 50-50q12-12 28.5-12t28.5 12l93 93q12 12 12 28.5T828-678L555-405ZM270-120H120v-150l285-285 150 150-285 285Z"/></svg>
            </button>
            <button class="btn btn-link" onclick="deleteDepartment('${dept.id}')" title="Delete">
              <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#992B15"><path d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z"/></svg>
            </button>
          </td>
        </tr>
      `;
    });
  }

  html += `</tbody></table></div>`;
  departmentsList.innerHTML = html;
}

async function renderRequestsList() {
  const requestsList = document.getElementById('requestsList');
  if (!requestsList) return;

  const { ok, data } = await apiFetch('/requests');

  if (!ok) {
    requestsList.innerHTML = `<p class="text-danger">${data.error || 'Failed to load requests'}</p>`;
    return;
  }

  const userRequests = data;

  if (userRequests.length === 0) {
    requestsList.innerHTML = '<p class="text-muted">No requests submitted yet.</p>';
    return;
  }

  let html = '';
  userRequests.forEach(request => {
    const statusClass = `badge-${request.status.toLowerCase()}`;
    const itemsHtml = request.items.map(item => `<li>${item.name} (Qty: ${item.qty})</li>`).join('');
    html += `
      <div class="request-card">
        <div style="display:flex;justify-content:space-between;align-items:start;">
          <div>
            <h5>${request.type}</h5>
            <p class="text-muted">${new Date(request.date).toLocaleDateString()}</p>
            <strong>Items:</strong>
            <ul style="margin-bottom:1rem;padding-left:1.25rem;">${itemsHtml}</ul>
          </div>
          <span class="badge ${statusClass}">${request.status}</span>
        </div>
      </div>
    `;
  });

  requestsList.innerHTML = html;
}

// ============================================
// MODAL FUNCTIONS
// ============================================

async function openAccountModal(accountId = null) {
  const accountForm = document.getElementById('accountForm');
  const accountModal = new bootstrap.Modal(document.getElementById('accountModal'));

  if (accountId) {
    const { ok, data } = await apiFetch('/accounts');
    if (ok) {
      const account = data.find(a => a.id === accountId);
      if (account) {
        document.getElementById('modalFirstName').value = account.firstName;
        document.getElementById('modalLastName').value = account.lastName;
        document.getElementById('modalEmail').value = account.email;
        document.getElementById('modalPassword').value = '';
        document.getElementById('modalPassword').required = false;
        document.getElementById('modalRole').value = account.role;
        document.getElementById('modalVerified').checked = account.verified;
        document.getElementById('accountModalLabel').textContent = 'Edit Account';
        accountForm.dataset.editingId = accountId;
      }
    }
  } else {
    accountForm.reset();
    document.getElementById('accountModalLabel').textContent = 'Add Account';
    document.getElementById('modalPassword').required = true;
    delete accountForm.dataset.editingId;
  }

  accountModal.show();
}

async function openEmployeeModal(employeeId = null) {
  const employeeForm = document.getElementById('employeeForm');
  const employeeModal = new bootstrap.Modal(document.getElementById('employeeModal'));

  // Populate department dropdown from API
  const deptSelect = document.getElementById('modalDepartment');
  deptSelect.innerHTML = '<option value="">-- Select Department --</option>';
  const deptResult = await apiFetch('/departments');
  if (deptResult.ok) {
    deptResult.data.forEach(dept => {
      const option = document.createElement('option');
      option.value = dept.id;
      option.textContent = dept.name;
      deptSelect.appendChild(option);
    });
  }

  // Populate user email dropdown from API
  const emailSelect = document.getElementById('modalEmployeeEmail');
  emailSelect.innerHTML = '<option value="">-- Select a user --</option>';
  const accResult = await apiFetch('/accounts');
  if (accResult.ok) {
    accResult.data.forEach(account => {
      const option = document.createElement('option');
      option.value = account.email;
      option.textContent = `${account.firstName} ${account.lastName} (${account.email})`;
      emailSelect.appendChild(option);
    });
  }

  if (employeeId) {
    const empResult = await apiFetch('/employees');
    if (empResult.ok) {
      const emp = empResult.data.find(e => e.id === employeeId);
      if (emp) {
        document.getElementById('modalEmployeeId').value = emp.employeeId;
        document.getElementById('modalEmployeeEmail').value = emp.userEmail;
        document.getElementById('modalPosition').value = emp.position;
        document.getElementById('modalDepartment').value = emp.departmentId;
        document.getElementById('modalHireDate').value = emp.hireDate;
        document.getElementById('employeeModalLabel').textContent = 'Edit Employee';
        employeeForm.dataset.editingId = employeeId;
      }
    }
  } else {
    employeeForm.reset();
    document.getElementById('employeeModalLabel').textContent = 'Add Employee';
    delete employeeForm.dataset.editingId;
  }

  employeeModal.show();
}

async function openDepartmentModal(departmentId = null) {
  const departmentForm = document.getElementById('departmentForm');
  const departmentModal = new bootstrap.Modal(document.getElementById('departmentModal'));

  if (departmentId) {
    const { ok, data } = await apiFetch('/departments');
    if (ok) {
      const dept = data.find(d => d.id === departmentId);
      if (dept) {
        document.getElementById('modalDepartmentName').value = dept.name;
        document.getElementById('modalDepartmentDesc').value = dept.description;
        document.getElementById('departmentModalLabel').textContent = 'Edit Department';
        departmentForm.dataset.editingId = departmentId;
      }
    }
  } else {
    departmentForm.reset();
    document.getElementById('departmentModalLabel').textContent = 'Add Department';
    delete departmentForm.dataset.editingId;
  }

  departmentModal.show();
}

async function resetPassword(accountId, email) {
  const newPassword = prompt(`Reset password for ${email}. Enter new password (min 6 chars):`);
  if (newPassword === null) return;

  if (newPassword.length < 6) {
    showToast('Password must be at least 6 characters', 'error');
    return;
  }

  const { ok, data } = await apiFetch(`/accounts/${accountId}/reset-password`, {
    method: 'PUT',
    body: JSON.stringify({ newPassword })
  });

  if (ok) {
    showToast(`Password reset for ${email}`, 'success');
  } else {
    showToast(data.error || 'Failed to reset password', 'error');
  }
}

async function deleteAccount(accountId, email) {
  if (!confirm(`Delete account for ${email}?`)) return;

  const { ok, data } = await apiFetch(`/accounts/${accountId}`, { method: 'DELETE' });

  if (ok) {
    showToast('Account deleted', 'success');
    renderAccountsList();
  } else {
    showToast(data.error || 'Failed to delete account', 'error');
  }
}

async function deleteEmployee(employeeId) {
  if (!confirm(`Delete this employee?`)) return;

  const { ok, data } = await apiFetch(`/employees/${employeeId}`, { method: 'DELETE' });

  if (ok) {
    showToast('Employee deleted', 'success');
    renderEmployeesTable();
  } else {
    showToast(data.error || 'Failed to delete employee', 'error');
  }
}

async function deleteDepartment(departmentId) {
  if (!confirm(`Delete this department?`)) return;

  const { ok, data } = await apiFetch(`/departments/${departmentId}`, { method: 'DELETE' });

  if (ok) {
    showToast('Department deleted', 'success');
    renderDepartmentsList();
  } else {
    showToast(data.error || 'Failed to delete department', 'error');
  }
}

function updateItemRemoveButtons() {
  const itemRows = document.querySelectorAll('#itemsList .item-row');
  itemRows.forEach(row => {
    const removeBtn = row.querySelector('.remove-item');
    if (removeBtn) removeBtn.style.display = itemRows.length > 1 ? 'block' : 'none';
  });
}