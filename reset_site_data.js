const pool = require('./backend/config/db');
const fs = require('fs');
const path = require('path');

async function resetSiteData() {
    let connection;
    try {
        connection = await pool.getConnection();
        console.log('--- STARTING GLOBAL SITE RESET ---');

        // Disable foreign key checks to allow truncation/deletion in any order
        await connection.execute('SET FOREIGN_KEY_CHECKS = 0');

        const tablesToClear = [
            'notifications',
            'feedbacks',
            'order_items',
            'orders',
            'cart_items',
            'favorites',
            'transactions',
            'products'
        ];

        for (const table of tablesToClear) {
            try {
                await connection.execute(`TRUNCATE TABLE ${table}`);
                console.log(`Cleared table: ${table}`);
            } catch (err) {
                if (err.code === 'ER_NO_SUCH_TABLE') {
                    console.log(`Table ${table} does not exist, skipping.`);
                } else {
                    console.error(`Error clearing table ${table}:`, err.message);
                }
            }
        }

        // Delete all users except admins
        const [userResult] = await connection.execute("DELETE FROM users WHERE role != 'admin'");
        console.log(`Deleted ${userResult.affectedRows} non-admin users.`);

        // Re-enable foreign key checks
        await connection.execute('SET FOREIGN_KEY_CHECKS = 1');

        // Clean up uploads folder
        const uploadsDir = path.join(__dirname, 'backend', 'uploads');
        if (fs.existsSync(uploadsDir)) {
            const files = fs.readdirSync(uploadsDir);
            for (const file of files) {
                if (file !== '.gitkeep') {
                    const filePath = path.join(uploadsDir, file);
                    try {
                        if (fs.lstatSync(filePath).isDirectory()) {
                            fs.rmSync(filePath, { recursive: true, force: true });
                        } else {
                            fs.unlinkSync(filePath);
                        }
                        console.log(`Deleted upload: ${file}`);
                    } catch (err) {
                        console.error(`Error deleting file ${file}:`, err.message);
                    }
                }
            }
            console.log('Uploads directory cleaned.');
        }

        console.log('--- SITE RESET SUCCESSFUL ---');
        console.log('Only Admin accounts remain in the database.');
    } catch (err) {
        console.error('CRITICAL ERROR DURING RESET:', err);
    } finally {
        if (connection) connection.release();
        process.exit();
    }
}

resetSiteData();
