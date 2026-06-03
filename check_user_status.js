const pool = require('./backend/config/db');
require('dotenv').config({ path: './backend/.env' });

async function checkUser(email) {
    let connection;
    try {
        connection = await pool.getConnection();
        const [users] = await connection.execute('SELECT id, username, email, isVerified, verificationToken FROM users WHERE email = ?', [email]);
        console.log(JSON.stringify(users, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        if (connection) connection.release();
        process.exit();
    }
}

checkUser('mohanad.mohamed.24136@gmail.com');
