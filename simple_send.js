const nodemailer = require('nodemailer');
require('dotenv').config({ path: './backend/.env' });

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: (process.env.EMAIL_PASS || '').replace(/\s/g, '')
    }
});

const mailOptions = {
    from: `"LUMINA Protocol" <${process.env.EMAIL_USER}>`,
    to: 'mohanad.mohamed.24136@gmail.com',
    subject: 'Manual Verification Link',
    text: 'Please verify your account: https://lumina-site.vercel.app/api/auth/verify?token=6d5f9aae-e9f2-4854-991f-68bd2deb1e63'
};

transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
        console.log('Error:', error);
    } else {
        console.log('Email sent:', info.response);
    }
    process.exit();
});
