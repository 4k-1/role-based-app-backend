// server.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
const PORT = 3000;
const SECRET_KEY = 'your-very-secure-secret';

// Enable CORS for frontend (e.g., Live Server on port 5500)
app.use(cors({ origin: ['http://127.0.0.1:5500', 'http://localhost:5500'] }));

// Middleware to parse JSON
app.use(express.json());

// ============================================
// IN-MEMORY DATABASE
// ============================================

let users = [
  { id: 1, username: 'admin', password: '$2a$10$...', role: 'admin' },
  { id: 2, username: 'alice', password: '$2a$10$...', role: 'user' }
];

let departments = [
  { id: 'dept-001', name: 'Engineering', description: 'Software and hardware engineering team' },
  { id: 'dept-002', name: 'HR', description: 'Human Resources department' }
];

let employees = [
  { id: 'emp-001', employeeId: 'EMP-00001', userEmail: 'admin', position: 'Senior Software Engineer', departmentId: 'dept-001', hireDate: '2023-01-15' },
  { id: 'emp-002', employeeId: 'EMP-00002', userEmail: 'alice', position: 'HR Specialist', departmentId: 'dept-002', hireDate: '2023-03-22' }
];

let requests = [];

// Pre-hash known passwords for demo
if (!users[0].password.includes('$2a$10$') || users[0].password === '$2a$10$...') {
  users[0].password = bcrypt.hashSync('admin123', 10);
  users[1].password = bcrypt.hashSync('user123', 10);
}

// ============================================
// MIDDLEWARE
// ============================================

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  });
}

function authorizeRole(role) {
  return (req, res, next) => {
    if (req.user.role !== role) {
      return res.status(403).json({ error: 'Access denied: insufficient permissions' });
    }
    next();
  };
}

// ============================================
// AUTH ROUTES
// ============================================

// POST /api/register
app.post('/api/register', async (req, res) => {
  const { username, password, role = 'user' } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const existing = users.find(u => u.username === username);
  if (existing) {
    return res.status(409).json({ error: 'User already exists' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const newUser = {
    id: users.length + 1,
    username,
    password: hashedPassword,
    role
  };

  users.push(newUser);
  res.status(201).json({ message: 'User registered', username, role });
});

// POST /api/login
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  const user = users.find(u => u.username === username);
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    SECRET_KEY,
    { expiresIn: '1h' }
  );

  res.json({ token, user: { username: user.username, role: user.role } });
});

// ============================================
// PROTECTED ROUTES
// ============================================

// GET /api/profile
app.get('/api/profile', authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

// GET /api/admin/dashboard
app.get('/api/admin/dashboard', authenticateToken, authorizeRole('admin'), (req, res) => {
  res.json({ message: 'Welcome to admin dashboard!', data: 'Secret admin info' });
});

// ============================================
// ACCOUNTS ROUTES (admin only)
// ============================================

app.get('/api/accounts', authenticateToken, authorizeRole('admin'), (req, res) => {
  const safeUsers = users.map(({ password, ...u }) => u);
  res.json(safeUsers);
});

app.post('/api/accounts', authenticateToken, authorizeRole('admin'), async (req, res) => {
  const { username, password, role, verified } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  if (users.find(u => u.username === username)) {
    return res.status(409).json({ error: 'Username already exists' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const newUser = {
    id: users.length + 1,
    username,
    password: hashedPassword,
    role: role || 'user',
    verified: verified || false
  };

  users.push(newUser);
  const { password: _, ...safeUser } = newUser;
  res.status(201).json(safeUser);
});

app.put('/api/accounts/:id', authenticateToken, authorizeRole('admin'), async (req, res) => {
  const user = users.find(u => u.id === parseInt(req.params.id));
  if (!user) return res.status(404).json({ error: 'User not found' });

  const { username, password, role, verified } = req.body;
  if (username) user.username = username;
  if (role) user.role = role;
  if (typeof verified === 'boolean') user.verified = verified;
  if (password) user.password = await bcrypt.hash(password, 10);

  const { password: _, ...safeUser } = user;
  res.json(safeUser);
});

app.delete('/api/accounts/:id', authenticateToken, authorizeRole('admin'), (req, res) => {
  const idx = users.findIndex(u => u.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'User not found' });

  if (users[idx].id === req.user.id) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }

  users.splice(idx, 1);
  res.json({ message: 'Account deleted' });
});

app.put('/api/accounts/:id/reset-password', authenticateToken, authorizeRole('admin'), async (req, res) => {
  const user = users.find(u => u.id === parseInt(req.params.id));
  if (!user) return res.status(404).json({ error: 'User not found' });

  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  user.password = await bcrypt.hash(newPassword, 10);
  res.json({ message: `Password reset for ${user.username}` });
});

// ============================================
// EMPLOYEES ROUTES (admin only)
// ============================================

app.get('/api/employees', authenticateToken, authorizeRole('admin'), (req, res) => {
  res.json(employees);
});

app.post('/api/employees', authenticateToken, authorizeRole('admin'), (req, res) => {
  const { employeeId, userEmail, position, departmentId, hireDate } = req.body;

  const newEmployee = {
    id: 'emp-' + Date.now(),
    employeeId,
    userEmail,
    position,
    departmentId,
    hireDate
  };

  employees.push(newEmployee);
  res.status(201).json(newEmployee);
});

app.put('/api/employees/:id', authenticateToken, authorizeRole('admin'), (req, res) => {
  const emp = employees.find(e => e.id === req.params.id);
  if (!emp) return res.status(404).json({ error: 'Employee not found' });

  const { employeeId, userEmail, position, departmentId, hireDate } = req.body;
  if (employeeId) emp.employeeId = employeeId;
  if (userEmail) emp.userEmail = userEmail;
  if (position) emp.position = position;
  if (departmentId) emp.departmentId = departmentId;
  if (hireDate) emp.hireDate = hireDate;

  res.json(emp);
});

app.delete('/api/employees/:id', authenticateToken, authorizeRole('admin'), (req, res) => {
  const idx = employees.findIndex(e => e.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Employee not found' });

  employees.splice(idx, 1);
  res.json({ message: 'Employee deleted' });
});

// ============================================
// DEPARTMENTS ROUTES (admin only)
// ============================================

app.get('/api/departments', authenticateToken, authorizeRole('admin'), (req, res) => {
  res.json(departments);
});

app.post('/api/departments', authenticateToken, authorizeRole('admin'), (req, res) => {
  const { name, description } = req.body;
  const newDept = { id: 'dept-' + Date.now(), name, description };
  departments.push(newDept);
  res.status(201).json(newDept);
});

app.put('/api/departments/:id', authenticateToken, authorizeRole('admin'), (req, res) => {
  const dept = departments.find(d => d.id === req.params.id);
  if (!dept) return res.status(404).json({ error: 'Department not found' });

  const { name, description } = req.body;
  if (name) dept.name = name;
  if (description !== undefined) dept.description = description;
  res.json(dept);
});

app.delete('/api/departments/:id', authenticateToken, authorizeRole('admin'), (req, res) => {
  const deptEmployees = employees.filter(e => e.departmentId === req.params.id);
  if (deptEmployees.length > 0) {
    return res.status(400).json({ error: `Cannot delete department with ${deptEmployees.length} employee(s)` });
  }

  const idx = departments.findIndex(d => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Department not found' });

  departments.splice(idx, 1);
  res.json({ message: 'Department deleted' });
});

// ============================================
// REQUESTS ROUTES
// ============================================

app.get('/api/requests', authenticateToken, (req, res) => {
  const userRequests = requests.filter(r => r.username === req.user.username);
  res.json(userRequests);
});

app.post('/api/requests', authenticateToken, (req, res) => {
  const { type, items } = req.body;

  if (!type || !items || items.length === 0) {
    return res.status(400).json({ error: 'Type and at least one item are required' });
  }

  const newRequest = {
    id: 'req-' + Date.now(),
    type,
    items,
    status: 'Pending',
    date: new Date().toISOString(),
    username: req.user.username
  };

  requests.push(newRequest);
  res.status(201).json(newRequest);
});

// ============================================
// PUBLIC ROUTE
// ============================================

app.get('/api/content/guest', (req, res) => {
  res.json({ message: 'Public content for all visitors' });
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
  console.log(`✅ Backend running on http://localhost:${PORT}`);
  console.log(`🔑 Try logging in with:`);
  console.log(`   - Admin: username=admin, password=admin123`);
  console.log(`   - User:  username=alice, password=user123`);
});