const nodemailer = require('nodemailer');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'backend/.env') });

async function testEmailToUser() {
    const targetEmail = 'mohanad.mohamed.24136@gmail.com';
    console.log(`--- Direct Email Test to: ${targetEmail} ---`);

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
        const mailOptions = {
            from: `"LUMINA PROTOCOL" <${process.env.EMAIL_USER}>`,
            to: targetEmail,
            subject: 'LUMINA - Direct Connectivity Test',
            html: `
                <div style="background: #000; color: white; padding: 50px; font-family: sans-serif;">
                    <h1 style="color: #00F0FF;">SYSTEM TEST</h1>
                    <p>If you see this, the server can reach your specific inbox.</p>
                    <p>Time: ${new Date().toLocaleString()}</p>
                </div>
            `
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('✅ Sent! Message ID:', info.messageId);
    } catch (err) {
        console.error('❌ Failed:', err);
    }
}

testEmailToUser();
