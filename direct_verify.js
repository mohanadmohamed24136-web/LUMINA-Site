const pool = require('./backend/config/db');
require('dotenv').config({ path: './backend/.env' });

async function verifyUserDirectly(email) {
    let connection;
    try {
        connection = await pool.getConnection();
        console.log(`--- Direct Verification Protocol for: ${email} ---`);

        // Update user to be verified and clear token
        const [result] = await connection.execute(
            'UPDATE users SET isVerified = 1, verificationToken = NULL WHERE email = ?',
            [email]
        );
        
        if (result.affectedRows > 0) {
            console.log(`✅ Success: User ${email} is now VERIFIED directly.`);
        } else {
            console.error('❌ Error: User not found in database.');
        }

    } catch (err) {
        console.error('❌ Critical Error:', err);
    } finally {
        if (connection) connection.release();
        process.exit();
    }
}

const targetEmail = 'mohanad.mohamed.24136@gmail.com';
verifyUserDirectly(targetEmail);
