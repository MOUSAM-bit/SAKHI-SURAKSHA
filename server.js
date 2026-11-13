require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 5001;

// Use /tmp directory on Vercel to prevent read-only file system (EROFS) errors
const CONTACTS_FILE = process.env.VERCEL
    ? path.join('/tmp', 'contacts.json')
    : path.join(__dirname, 'contacts.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function getContacts() {
    if (!fs.existsSync(CONTACTS_FILE)) {
        // If file doesn't exist in /tmp, check if local template exists or start empty
        const initialData = fs.existsSync(path.join(__dirname, 'contacts.json'))
            ? fs.readFileSync(path.join(__dirname, 'contacts.json'), 'utf8')
            : '[]';
        fs.writeFileSync(CONTACTS_FILE, initialData);
    }
    return JSON.parse(fs.readFileSync(CONTACTS_FILE, 'utf8'));
}

function saveContacts(contacts) {
    fs.writeFileSync(CONTACTS_FILE, JSON.stringify(contacts, null, 2));
}

app.get('/api/contacts', (req, res) => {
    try {
        res.json({ success: true, contacts: getContacts() });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to load contacts' });
    }
});

app.post('/api/contacts', (req, res) => {
    const { name, phone, email } = req.body;
    if (!name || !email) {
        return res.status(400).json({ success: false, error: 'Name and Email are required for emergency alerts.' });
    }
    const contacts = getContacts();
    const newContact = { id: Date.now(), name, phone, email };
    contacts.push(newContact);
    saveContacts(contacts);
    res.json({ success: true, contact: newContact });
});

app.delete('/api/contacts/:id', (req, res) => {
    const id = Number(req.params.id);
    const contacts = getContacts().filter(c => c.id !== id);
    saveContacts(contacts);
    res.json({ success: true });
});

app.post('/api/sos', async (req, res) => {
    try {
        const { latitude, longitude, triggerType } = req.body;
        const contacts = getContacts();

        if (contacts.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No emergency contacts saved! Please add at least one email contact first.'
            });
        }

        const mapsLink = (latitude && longitude)
            ? `https://www.google.com/maps?q=${latitude},${longitude}`
            : 'Location unavailable (GPS permission denied)';

        const alertText = `EMERGENCY SOS ALERT! Triggered via: ${triggerType || 'SOS Button'}. Live Location: ${mapsLink}`;
        const emailList = contacts.map(c => c.email).filter(Boolean);

        if (emailList.length === 0) {
            return res.status(400).json({ success: false, error: 'No valid email addresses found in your saved contacts.' });
        }

        if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
            return res.status(500).json({ success: false, error: 'Server email credentials are not configured.' });
        }

        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: Number(process.env.SMTP_PORT) || 587,
            secure: false,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        });

        await transporter.sendMail({
            from: `"SakhiSuraksha SOS" <${process.env.SMTP_USER}>`,
            to: emailList.join(','),
            subject: '🚨 EMERGENCY SOS ALERT - Immediate Help Needed!',
            text: alertText,
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; border: 2px solid #dc2626; border-radius: 8px; background-color: #fef2f2;">
                    <h2 style="color: #dc2626; margin-top: 0;">🚨 EMERGENCY SOS TRIGGERED!</h2>
                    <p><strong>Trigger Method:</strong> ${triggerType || 'Manual SOS Button'}</p>
                    <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
                    <p><strong>Live GPS Location:</strong> <a href="${mapsLink}" target="_blank" style="color: #2563eb; font-weight: bold;">${mapsLink}</a></p>
                    <p style="color: #555; margin-top: 20px;">Please check immediately or contact emergency responders on behalf of the user.</p>
                </div>
            `
        });

        return res.json({
            success: true,
            message: `Emergency Alert successfully dispatched to ${emailList.length} contact(s)!`
        });

    } catch (err) {
        console.error('SOS Error:', err);
        return res.status(500).json({
            success: false,
            error: err.message || 'Internal Server Error'
        });
    }
});

app.listen(PORT, () => {
    console.log(`SakhiSuraksha server running on port ${PORT}`);
});