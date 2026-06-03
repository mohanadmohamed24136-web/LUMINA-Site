const nodemailer = require('nodemailer');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'backend/.env') });

async function testEmail() {
    console.log('--- Email Connectivity Test ---');
    console.log('User:', process.env.EMAIL_USER);
    console.log('Pass:', process.env.EMAIL_PASS ? '********' : 'NOT FOUND');

    const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: {
            user: process.env.EMAIL_USER,
            pass: (process.env.EMAIL_PASS || '').replace(/\s/g, '')
        }
    });

    try {
        await transporter.verify();
        console.log('✅ Connection to Gmail SMTP server successful!');

        const mailOptions = {
            from: `"LUMINA Test" <${process.env.EMAIL_USER}>`,
            to: process.env.EMAIL_USER, // Send to yourself
            subject: 'LUMINA Connectivity Test',
            text: 'If you receive this, the email protocol is functioning correctly.'
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('✅ Email sent successfully!');
        console.log('Message ID:', info.messageId);
    } catch (err) {
        console.error('❌ Email Test Failed!');
        console.error('Error Details:', err);
    }
}

testEmail();
