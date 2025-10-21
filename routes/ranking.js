const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

const db = new sqlite3.Database(path.join(__dirname, '../db/karate_ranking.db'));

// GET /ranking
router.get('/', (req, res) => {
  // Extract filters from query
  const filters = {
    gender: req.query.gender || '',
    age_category_id: req.query.age_category_id || '',
    weight_category_id: req.query.weight_category_id || '',
    club_id: req.query.club_id || ''
  };

  // Base SQL
  let sql = `
    SELECT a.*, c.name AS club_name, ac.name AS age_category_name, wc.name AS weight_category_name
    FROM athletes a
    LEFT JOIN clubs c ON a.club_id = c.id
    LEFT JOIN age_categories ac ON a.age_category_id = ac.id
    LEFT JOIN weight_categories wc ON a.weight_category_id = wc.id
    WHERE 1=1
  `;
  const params = [];

  // Apply filters
  if (filters.gender) { sql += ' AND a.gender = ?'; params.push(filters.gender); }
  if (filters.age_category_id) { sql += ' AND a.age_category_id = ?'; params.push(filters.age_category_id); }
  if (filters.weight_category_id) { sql += ' AND a.weight_category_id = ?'; params.push(filters.weight_category_id); }
  if (filters.club_id) { sql += ' AND a.club_id = ?'; params.push(filters.club_id); }

  sql += ' ORDER BY a.total_points DESC';

  db.all(sql, params, (err, athletes) => {
    if (err) return console.error(err);

    // Fetch filter dropdown data
    db.all('SELECT * FROM age_categories ORDER BY min_age', (err1, ageCategories) => {
      db.all('SELECT * FROM weight_categories ORDER BY name', (err2, weightCategories) => {
        db.all('SELECT * FROM clubs ORDER BY name', (err3, clubs) => {
          res.render('ranking/index', {
            athletes,
            filters,
            ageCategories,
            weightCategories,
            clubs
          });
        });
      });
    });
  });
});

// Preview ranking for a given year
router.get('/preview/:year', (req, res) => {
  const year = parseInt(req.params.year);

  const sql = `
    SELECT a.*, c.name AS club_name, ac.name AS age_category_name, wc.name AS weight_category_name
    FROM athletes a
    LEFT JOIN clubs c ON a.club_id = c.id
    LEFT JOIN age_categories ac ON a.age_category_id = ac.id
    LEFT JOIN weight_categories wc ON a.weight_category_id = wc.id
    ORDER BY a.total_points DESC
  `;

  db.all(sql, [], (err, athletes) => {
    if (err) return console.error(err);

    // Build the "preview" object
    const preview = athletes.map(a => {
      return {
        full_name: a.full_name,
        totalPoints: a.total_points || 0,
        lastYearPoints: Math.floor(a.total_points * 0.5), // example previous year
        thisYearPoints: a.total_points, // this year
        warnings: [], // populate later if needed
        tournamentDetails: [] // populate from tournaments table if available
      };
    });

    res.render('ranking/preview', {
      year,
      preview,
      currentUser: req.user || null // if using authentication
    });
  });
});

// --- EXPORT EXCEL ---
router.get('/export/excel', async (req, res) => {
  const filters = req.query;
  let sql = `
    SELECT a.full_name, a.gender, ac.name AS age_category, wc.name AS weight_category, c.name AS club, a.total_points
    FROM athletes a
    LEFT JOIN age_categories ac ON a.age_category_id = ac.id
    LEFT JOIN weight_categories wc ON a.weight_category_id = wc.id
    LEFT JOIN clubs c ON a.club_id = c.id
    WHERE 1=1
  `;
  const params = [];
  if (filters.gender) { sql += " AND a.gender = ?"; params.push(filters.gender); }
  if (filters.age_category_id) { sql += " AND a.age_category_id = ?"; params.push(filters.age_category_id); }
  if (filters.weight_category_id) { sql += " AND a.weight_category_id = ?"; params.push(filters.weight_category_id); }
  if (filters.club_id) { sql += " AND a.club_id = ?"; params.push(filters.club_id); }

  db.all(sql, params, async (err, rows) => {
    if (err) return res.status(500).send('DB Error');

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Ranking');

    sheet.columns = [
      { header: 'Rank', key: 'rank', width: 6 },
      { header: 'Name', key: 'full_name', width: 25 },
      { header: 'Gender', key: 'gender', width: 10 },
      { header: 'Age Category', key: 'age_category', width: 20 },
      { header: 'Weight Category', key: 'weight_category', width: 20 },
      { header: 'Club', key: 'club', width: 20 },
      { header: 'Total Points', key: 'total_points', width: 15 }
    ];
    rows.forEach((r, i) => {
      sheet.addRow({
        rank: i + 1,
        full_name: r.full_name,
        gender: r.gender === 'male' ? 'Άνδρας' : 'Γυναίκα',
        age_category: r.age_category || '-',
        weight_category: r.weight_category || '-',
        club: r.club || '-',
        total_points: r.total_points
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="ranking.xlsx"');

    await workbook.xlsx.write(res);
    res.end();
  });
});

// --- EXPORT PDF ---
router.get('/export/pdf', (req, res) => {
  const filters = req.query;
  let sql = `
    SELECT a.full_name, a.gender, ac.name AS age_category, wc.name AS weight_category, 
           c.name AS club, a.total_points
    FROM athletes a
    LEFT JOIN age_categories ac ON a.age_category_id = ac.id
    LEFT JOIN weight_categories wc ON a.weight_category_id = wc.id
    LEFT JOIN clubs c ON a.club_id = c.id
    WHERE 1=1
  `;
  const params = [];
  if (filters.gender) { sql += " AND a.gender = ?"; params.push(filters.gender); }
  if (filters.age_category_id) { sql += " AND a.age_category_id = ?"; params.push(filters.age_category_id); }
  if (filters.weight_category_id) { sql += " AND a.weight_category_id = ?"; params.push(filters.weight_category_id); }
  if (filters.club_id) { sql += " AND a.club_id = ?"; params.push(filters.club_id); }

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).send('DB Error');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="ranking.pdf"');

    const PDFDocument = require('pdfkit');
    const fs = require('fs');
    const path = require('path');
    // const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const fontPath = path.join(__dirname, '../public/fonts/DejaVuSans.ttf');
    doc.registerFont('DejaVu', fontPath);
    doc.font('DejaVu');

    doc.pipe(res);

    // --- HEADER ---
    try {
      const logoPath = path.join(__dirname, '../public/images/logo.png');
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, 40, 30, { width: 60 });
      }
    } catch (e) { }

    doc.fontSize(20).fillColor('#1d3557').text('Κατάταξη Αθλητών', 0, 40, { align: 'center' });
    doc.moveDown(2);

    // --- TABLE HEADER ---
    const tableTop = 120;
    const rowHeight = 25;
    const colWidths = [40, 150, 60, 40, 60, 100, 40]; // approximate column widths

    const headers = ['#', 'Όνομα', 'Φύλο', 'Ηλικία', 'Βάρος', 'Σύλλογος', 'Πόντοι'];

    doc.fontSize(10).fillColor('#fff').rect(40, tableTop, 500, rowHeight).fill('#1d3557');
    headers.forEach((h, i) => {
      doc.fillColor('#fff').text(h, 45 + colWidths.slice(0, i).reduce((a, b) => a + b, 0), tableTop + 7);
    });

    // --- TABLE ROWS ---
    let y = tableTop + rowHeight;
    rows.sort((a, b) => b.total_points - a.total_points);
    rows.forEach((r, i) => {
      const isEven = i % 2 === 0;
      doc.rect(40, y, 500, rowHeight).fill(isEven ? '#f8f9fa' : '#ffffff');
      doc.fillColor('#000').fontSize(8);

      const gender = r.gender === 'male' ? 'Άνδρας' : 'Γυναίκα';
      const rowData = [
        i + 1,
        r.full_name,
        gender,
        r.age_category || '-',
        r.weight_category || '-',
        r.club || '-',
        r.total_points
      ];

      rowData.forEach((text, idx) => {
        doc.text(String(text), 45 + colWidths.slice(0, idx).reduce((a, b) => a + b, 0), y + 7, {
          width: colWidths[idx] - 5,
          ellipsis: true
        });
      });

      y += rowHeight;

      // Add new page if needed
      if (y > 760) {
        doc.addPage();
        y = 60;
      }
    });

    // --- FOOTER ---
    doc.fontSize(8).fillColor('#888')
      .text(`Ημερομηνία δημιουργίας: ${new Date().toLocaleDateString('el-GR')}`, 40, 800 - 40, { align: 'center' });

    doc.end();
  });
});


module.exports = router;
