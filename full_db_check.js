const pool = require('./backend/config/db');

async function checkFullDB() {
    let connection;
    try {
        connection = await pool.getConnection();
        
        const tables = ['users', 'products', 'subscriptions', 'payments', 'feedbacks', 'cart_items', 'orders', 'order_items', 'favorites', 'transactions'];
        
        for (const table of tables) {
            console.log(`\n--- Structure of table: ${table} ---`);
            try {
                const [columns] = await connection.execute(`DESCRIBE ${table}`);
                console.table(columns.map(c => ({
                    Field: c.Field,
                    Type: c.Type,
                    Null: c.Null,
                    Key: c.Key,
                    Default: c.Default
                })));
            } catch (err) {
                console.error(`Table ${table} might not exist:`, err.message);
            }
        }

    } catch (err) {
        console.error('Database connection error:', err);
    } finally {
        if (connection) connection.release();
        process.exit();
    }
}

checkFullDB();
