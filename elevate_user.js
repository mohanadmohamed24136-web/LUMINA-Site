const pool = require('./backend/config/db');
const bcrypt = require('bcryptjs');

async function elevateAdmins() {
    const emails = [
        'mohanad.mohamed.24136@gmail.com',
        'lumina.future.ai@gmail.com',
        'dodoop863@gmail.com'
    ];
    let connection;

    try {
        connection = await pool.getConnection();
        const hashedPassword = await bcrypt.hash('admin123', 10);

        for (const email of emails) {
            console.log(`--- ELEVATING USER TO ADMIN & DESIGNER: ${email} ---`);

            // Check if user exists
            const [users] = await connection.execute('SELECT id FROM users WHERE email = ?', [email]);
            
            if (users.length > 0) {
                // Update role to admin and ensure they are also recognized as designers by the UI
                await connection.execute('UPDATE users SET role = "admin", isVerified = 1, subscription_tier = "premium" WHERE email = ?', [email]);
                console.log(`SUCCESS: User ${email} is now a Verified Admin & Premium.`);
            } else {
                console.log(`User ${email} not found. Creating a new account...`);
                await connection.execute(
                    'INSERT INTO users (username, email, password, role, isVerified, subscription_tier) VALUES (?, ?, ?, ?, ?, ?)',
                    ['Admin', email, hashedPassword, 'admin', 1, 'premium']
                );
                console.log(`SUCCESS: New Admin account created for ${email}. Password: admin123`);
            }
        }

    } catch (err) {
        console.error('ERROR during elevation:', err);
    } finally {
        if (connection) connection.release();
        process.exit();
    }
}

elevateAdmins();
