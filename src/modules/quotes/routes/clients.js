const express = require('express');
const { pool } = require('../config/database');
const { authenticate, authorize, validateOwnership } = require('../../../shared/middleware/authMiddleware');
const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const { search } = req.query;
    let query = 'SELECT * FROM clients WHERE active = 1';
    let params = [];

    if (search) {
      query += ' AND (name LIKE ? OR email LIKE ? OR phone LIKE ? OR company LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    query += ' ORDER BY name';

    const [rows] = await pool.execute(query, params);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching clients:', error);
    res.status(500).json({ error: 'Failed to fetch clients' });
  }
});

router.get('/:id', authenticate, validateOwnership('client'), async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM clients WHERE id = ? AND active = 1',
      [req.params.id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }
    
    res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching client:', error);
    res.status(500).json({ error: 'Failed to fetch client' });
  }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const { name, email, phone, company, address, rnc } = req.body;
    
    console.log('Creating client with data:', { name, email, phone, company, address, rnc });
    console.log('User ID:', req.user.id);
    
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    console.log('Executing INSERT statement...');
    const [result] = await pool.execute(
      'INSERT INTO clients (name, email, phone, company, address, rnc, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)',
      [name, email, phone, company, address, rnc, req.user.id]
    );

    console.log('INSERT result:', result);

    console.log('Fetching new client with ID:', result.insertId);
    const [newClient] = await pool.execute(
      'SELECT * FROM clients WHERE id = ?',
      [result.insertId]
    );

    console.log('New client data:', newClient[0]);
    res.status(201).json(newClient[0]);
  } catch (error) {
    console.error('Error creating client - full error:', error);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: 'Failed to create client', details: error.message });
  }
});

router.put('/:id', authenticate, validateOwnership('client'), async (req, res) => {
  try {
    const { name, email, phone, company, address, rnc } = req.body;
    
    const [result] = await pool.execute(
      'UPDATE clients SET name = ?, email = ?, phone = ?, company = ?, address = ?, rnc = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [name, email, phone, company, address, rnc, req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const [updatedClient] = await pool.execute(
      'SELECT * FROM clients WHERE id = ?',
      [req.params.id]
    );

    res.json(updatedClient[0]);
  } catch (error) {
    console.error('Error updating client:', error);
    res.status(500).json({ error: 'Failed to update client' });
  }
});

module.exports = router;