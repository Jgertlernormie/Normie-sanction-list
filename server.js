const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const fs = require('fs');
const pdfkit = require('pdfkit');
const bodyParser = require('body-parser');
const axios = require('axios');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');

// Load env variables
dotenv.config();

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('MongoDB connected');
}).catch(err => {
  console.error('MongoDB connection error:', err);
});

// Models
const Check = mongoose.model('Check', {
  fullName: String,
  staff: String,
  date: Date,
  match: Boolean,
  matchedId: String
});

const app = express();

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.post('/api/check', async (req, res) => {
  const { fullName, staff } = req.body;

  try {
    const response = await axios.post(
      'https://api.opensanctions.org/match/sanctions?algorithm=best',
      {
        queries: {
          q1: {
            schema: 'Person',
            properties: {
              name: [fullName]
            }
          }
        }
      },
      {
        headers: {
          Authorization: `ApiKey ${process.env.OPENSANCTIONS_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const result = response.data.results.q1;
    const isMatch = result.match !== null;

    // Save to MongoDB
    const record = await Check.create({
      fullName,
      staff,
      date: new Date(),
      match: isMatch,
      matchedId: isMatch ? result.match.id : null
    });

    // Generate PDF
    const doc = new pdfkit();
    const filePath = path.join(__dirname, 'public', 'result.pdf');
    const writeStream = fs.createWriteStream(filePath);

    doc.pipe(writeStream);

    doc.fontSize(24).text(isMatch ? '❌ FAILED' : '✅ PASSED', { align: 'center' });
    doc.moveDown();
    doc.fontSize(14).text(`Name: ${fullName}`);
    doc.text(`Checked by: ${staff}`);
    doc.text(`Date: ${new Date().toLocaleString()}`);
    doc.moveDown();
    doc.text(isMatch
      ? 'A match was found on the sanctions list. Please contact your money laundering officer immediately.'
      : """We have not found any matches against the sanctions list. This name will now be monitored. Should the name be added, we will notify Lettings@normie.co.uk.""");
    doc.text('Source: UK SANCTIONS LIST');
    doc.end();

    writeStream.on('finish', () => {
      res.json({
        match: isMatch,
        pdfUrl: '/result.pdf'
      });
    });

  } catch (err) {
    console.error('Error during sanctions check:', err.message);
    res.status(500).json({ error: 'Sanctions check failed' });
  }
});

app.get('/api/recheck', async (req, res) => {
  // Placeholder for recheck route
  res.send('Recheck route placeholder');
});

// ✅ Render-compatible port handling
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
