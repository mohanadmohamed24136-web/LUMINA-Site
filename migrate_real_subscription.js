const pool = require('./backend/config/db');

async function migrate() {
    let connection;
    try {
        connection = await pool.getConnection();
        console.log('Migrating database for REAL subscription system...');
        
        // 1. Update users table
        const [userColumns] = await connection.execute('SHOW COLUMNS FROM users');
        const userColumnNames = userColumns.map(c => c.Field);

        if (!userColumnNames.includes('stripe_customer_id')) {
            await connection.execute("ALTER TABLE users ADD COLUMN stripe_customer_id VARCHAR(255) NULL");
            console.log('Added stripe_customer_id column');
        }

        // 2. Create subscriptions table
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS subscriptions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                stripe_subscription_id VARCHAR(255) NOT NULL,
                stripe_customer_id VARCHAR(255) NOT NULL,
                plan_id VARCHAR(255) NOT NULL,
                status VARCHAR(50) NOT NULL,
                current_period_start DATETIME NOT NULL,
                current_period_end DATETIME NOT NULL,
                cancel_at_period_end TINYINT(1) DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
        console.log('Created subscriptions table');

        // 3. Create payments table (optional but good for history)
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS payments (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                stripe_payment_intent_id VARCHAR(255) NOT NULL,
                amount DECIMAL(10, 2) NOT NULL,
                currency VARCHAR(10) DEFAULT 'usd',
                status VARCHAR(50) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
        console.log('Created payments table');

        // 4. Update orders table for Stripe
        const [orderColumns] = await connection.execute('SHOW COLUMNS FROM orders');
        const orderColumnNames = orderColumns.map(c => c.Field);
        if (!orderColumnNames.includes('stripe_session_id')) {
            await connection.execute("ALTER TABLE orders ADD COLUMN stripe_session_id VARCHAR(255) NULL");
            console.log('Added stripe_session_id to orders');
        }
        
        console.log('Migration completed successfully.');
    } catch (err) {
        console.error('Migration error:', err);
    } finally {
        if (connection) connection.release();
        process.exit();
    }
}

migrate();
