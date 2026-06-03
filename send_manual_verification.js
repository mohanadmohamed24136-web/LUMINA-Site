const pool = require('./backend/config/db');
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config({ path: './backend/.env' });

async function sendManualVerification(email) {
    let connection;
    try {
        connection = await pool.getConnection();
        console.log(`--- Manual Verification Protocol for: ${email} ---`);

        // 1. Check if user exists
        const [users] = await connection.execute('SELECT id, username, verificationToken FROM users WHERE email = ?', [email]);
        
        if (users.length === 0) {
            console.error('❌ Error: User not found in database.');
            return;
        }

        const user = users[0];
        let token = user.verificationToken;

        // 2. Generate new token if none exists
        if (!token) {
            token = uuidv4();
            await connection.execute('UPDATE users SET verificationToken = ?, isVerified = 0 WHERE id = ?', [token, user.id]);
            console.log('Generated new verification token.');
        }

        // 3. Setup Transporter
        const transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 465,
            secure: true,
            auth: {
                user: process.env.EMAIL_USER,
                pass: (process.env.EMAIL_PASS || '').replace(/\s/g, '')
            }
        });

        // 4. Construct Link (Using Vercel production URL)
        const baseUrl = 'https://lumina-site.vercel.app'; // Standard Vercel URL pattern based on repo name
        const verificationLink = `${baseUrl}/api/auth/verify?token=${token}`;

        // 5. Send Email
        const mailOptions = {
            from: `"LUMINA Protocol" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: 'Activate Your LUMINA Neural Signature',
            text: `Welcome to LUMINA. Please verify your account using this link: ${verificationLink}`,
            html: `
                <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; background-color: #050505; color: #ffffff; border-radius: 30px; max-width: 600px; margin: auto; border: 1px solid #1a1a1a;">
                    <div style="text-align: center; margin-bottom: 30px;">
                        <h1 style="color: #00F0FF; text-transform: uppercase; letter-spacing: 5px; margin: 0; font-size: 32px;">LUMINA</h1>
                        <p style="color: #666; font-size: 10px; text-transform: uppercase; letter-spacing: 2px;">Future of Fashion Architecture</p>
                    </div>
                    
                    <div style="background: rgba(255,255,255,0.03); padding: 30px; border-radius: 20px; border: 1px solid rgba(0,240,255,0.1);">
                        <p style="font-size: 18px; line-height: 1.6; margin-bottom: 25px;">Welcome, <span style="color: #00F0FF; font-weight: bold;">${user.username}</span>.</p>
                        <p style="font-size: 14px; color: #ccc; line-height: 1.6; margin-bottom: 30px;">Your neural profile has been initialized. To activate your access to the LUMINA grid and start your journey into visionary fashion, please verify your signature below.</p>
                        
                        <div style="text-align: center;">
                            <a href="${verificationLink}" style="display: inline-block; padding: 18px 40px; background-color: #00F0FF; color: #000000; text-decoration: none; font-weight: 900; border-radius: 15px; text-transform: uppercase; letter-spacing: 2px; font-size: 14px; box-shadow: 0 10px 20px rgba(0,240,255,0.2);">Verify Signature</a>
                        </div>
                    </div>
                </div>
            `
        };

        console.log('Attempting to send email...');
        const info = await transporter.sendMail(mailOptions);
        console.log(`✅ Success: Verification email sent to ${email}`);
        console.log('Message ID:', info.messageId);
        console.log(`Link: ${verificationLink}`);

    } catch (err) {
        console.error('❌ Critical Error:', err);
    } finally {
        if (connection) connection.release();
        process.exit();
    }
}

const targetEmail = process.argv[2] || 'mohanad.mohamed.24136@gmail.com';
sendManualVerification(targetEmail);
