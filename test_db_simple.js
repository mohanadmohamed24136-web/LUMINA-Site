const pool = require('./backend/config/db');

async function check() {
    let connection;
    try {
        console.log('Attempting to connect to database...');
        connection = await pool.getConnection();
        console.log('Connected successfully!');
        const [rows] = await connection.execute('SHOW TABLES');
        console.log('Tables in database:', rows.map(r => Object.values(r)[0]));
    } catch (err) {
        console.error('Database connection error:', err);
    } finally {
        if (connection) connection.release();
        process.exit();
    }
}

check();
