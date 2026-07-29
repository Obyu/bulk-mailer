const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS, Private Network Access and JSON parsing
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Private-Network', 'true');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});
app.use(cors());
app.use(express.json());

// Serve static files from 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

// Configure Multer for file uploads (attachments)
const uploadDir = path.join(__dirname, 'temp_uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Keep original filename or prepend timestamp
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage: storage });

// Helper to create Nodemailer transporter
function createTransporter(config) {
  const isSecure = config.secure === true || config.secure === 'true' || config.port == 465;
  return nodemailer.createTransport({
    host: config.host,
    port: parseInt(config.port) || 587,
    secure: isSecure,
    auth: {
      user: config.user,
      pass: config.pass
    },
    tls: {
      // Do not fail on invalid certs
      rejectUnauthorized: false
    }
  });
}

// 1. API: Verify SMTP credentials
app.post('/api/verify-smtp', async (req, res) => {
  const { host, port, secure, user, pass } = req.body;

  if (!host || !port || !user || !pass) {
    return res.status(400).json({ success: false, error: 'Informasi SMTP belum lengkap (Host, Port, Email, & Password wajib diisi).' });
  }

  try {
    const transporter = createTransporter({ host, port, secure, user, pass });
    await transporter.verify();
    res.json({ success: true, message: `Koneksi SMTP ke ${host}:${port} berhasil terverifikasi!` });
  } catch (error) {
    console.error('SMTP Verification Error:', error);
    let errorMsg = error.message || 'Koneksi SMTP gagal.';
    if (error.code === 'EAUTH') {
      errorMsg = 'Autentikasi gagal! Periksa kembali email dan App Password Anda.';
    } else if (error.code === 'ESOCKET' || error.code === 'ETIMEDOUT') {
      errorMsg = `Gagal terhubung ke host ${host}:${port}. Periksa koneksi internet atau port SMTP.`;
    }
    res.status(200).json({ success: false, error: errorMsg });
  }
});

// 2. API: Upload attachment file
app.post('/api/upload-attachment', upload.single('attachment'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No file uploaded.' });
  }
  res.json({
    success: true,
    file: {
      filename: req.file.filename,
      originalname: req.file.originalname,
      path: req.file.path
    }
  });
});

// 3. API: Send a single email
app.post('/api/send-email', async (req, res) => {
  const { smtpConfig, recipientEmail, subject, htmlBody, attachment } = req.body;

  if (!smtpConfig || !recipientEmail || !subject || !htmlBody) {
    return res.status(400).json({ success: false, error: 'Missing required parameters.' });
  }

  try {
    const transporter = createTransporter(smtpConfig);
    const fromName = smtpConfig.fromName || 'MNC University';
    const fromEmail = smtpConfig.user;

    let body = htmlBody;
    const attachments = [];

    // Check if body references local logo.png
    if (body.includes('src="logo.png"')) {
      body = body.replace(/src="logo.png"/g, 'src="cid:logo"');
      attachments.push({
        filename: 'logo.png',
        path: path.join(__dirname, 'public', 'logo.png'),
        cid: 'logo'
      });
    }

    // Add user attachment
    if (attachment) {
      if (attachment.data) {
        // Base64 attachment (e.g. dynamic certificate)
        const base64Data = attachment.data.split(',')[1];
        attachments.push({
          filename: attachment.originalname || 'sertifikat.pdf',
          content: Buffer.from(base64Data, 'base64'),
          contentType: 'application/pdf'
        });
      } else if (attachment.filename) {
        // Standard uploaded file attachment
        const filePath = path.join(uploadDir, attachment.filename);
        if (fs.existsSync(filePath)) {
          attachments.push({
            filename: attachment.originalname || attachment.filename,
            path: filePath
          });
        }
      }
    }

    const mailOptions = {
      from: `"${fromName}" <${fromEmail}>`,
      to: recipientEmail,
      subject: subject,
      html: body,
      attachments: attachments
    };

    const info = await transporter.sendMail(mailOptions);
    res.json({ success: true, messageId: info.messageId });
  } catch (error) {
    console.error(`Error sending email to ${recipientEmail}:`, error);
    res.status(200).json({ success: false, error: error.message || 'Failed to send email.' });
  }
});

// 4. API: Clean up temp attachments
app.post('/api/clean-attachments', (req, res) => {
  try {
    const files = fs.readdirSync(uploadDir);
    for (const file of files) {
      fs.unlinkSync(path.join(uploadDir, file));
    }
    res.json({ success: true, message: 'All temporary attachments cleared.' });
  } catch (error) {
    console.error('Error cleaning attachments:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
